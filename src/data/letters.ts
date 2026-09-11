import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  where,
  type QueryConstraint,
} from '@firebase/firestore';

import { db } from '@/lib/firebase';
import type { DamageLevel, LetterDoc, LetterReplyDoc } from '@/types/letter';
import type { PetDoc } from '@/types/pet';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

/** sendLetter가 트랜잭션 안에서 펫이 idle인지 확인하다가 이미 away인 걸
 * 발견하면 던진다 — 화면 목록이 조금 낡아있어도(예: 다른 탭에서 방금
 * 보냈음) 실제로 편지가 중복 생성되지 않게 막아준다. */
export class PetBusyError extends Error {}

export type LettersPage = { letters: LetterDoc[]; nextCursor: number | null };

async function listLettersPage(field: 'toUid' | 'fromUid', uid: string, pageSize: number, cursorMs?: number | null): Promise<LettersPage> {
  const database = requireDb();
  const constraints: QueryConstraint[] = [where(field, '==', uid), orderBy('createdAt', 'desc')];
  if (cursorMs) constraints.push(startAfter(Timestamp.fromMillis(cursorMs)));
  const snap = await getDocs(query(collection(database, 'letters'), ...constraints, limit(pageSize)));
  const letters = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LetterDoc, 'id'>) }));
  const lastDoc = snap.docs[snap.docs.length - 1];
  const lastMs = (lastDoc?.data().createdAt as Timestamp | undefined)?.toMillis() ?? null;
  return { letters, nextCursor: snap.docs.length === pageSize ? lastMs : null };
}

/** 받은편지함/보낸편지함을 각각 단일 쿼리로 나눠 둔 이유는
 * src/types/letter.ts의 LetterDoc 주석 참고 — 답장하기(받은 것)와 상태
 * 확인(보낸 것)은 필요한 상호작용이 달라서 처음부터 합치지 않았다. */
export function listReceivedLettersPage(uid: string, pageSize: number, cursorMs?: number | null): Promise<LettersPage> {
  return listLettersPage('toUid', uid, pageSize, cursorMs);
}

/** 답장이 온 편지는 목록 미리보기에 원래 보낸 내용 대신 "답장이 왔는지"를
 * 붙여서 보여준다 — 보낸 사람 입장에선 그게 더 새로운 정보다. 페이지당
 * 최대 pageSize(20)개만 훑으므로 답장 서브문서를 하나씩 추가로 읽어도
 * 감당할 수 있는 수준이다. */
export async function listSentLettersPage(uid: string, pageSize: number, cursorMs?: number | null): Promise<LettersPage> {
  const database = requireDb();
  const page = await listLettersPage('fromUid', uid, pageSize, cursorMs);
  const repliedLetters = page.letters.filter((l) => l.status === 'replied');
  if (repliedLetters.length === 0) return page;

  const previews = await Promise.all(
    repliedLetters.map((l) => getDoc(doc(database, 'letters', l.id, 'reply', 'main')).catch(() => null))
  );
  const previewById = new Map(
    repliedLetters.map((l, i) => [l.id, previews[i]?.exists() ? (previews[i]!.data() as LetterReplyDoc) : null])
  );
  return {
    ...page,
    letters: page.letters.map((l) => {
      const reply = previewById.get(l.id);
      return reply ? { ...l, replyPreview: { body: reply.body, damage: reply.damage } } : l;
    }),
  };
}

export async function getLetter(letterId: string): Promise<LetterDoc | null> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'letters', letterId));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<LetterDoc, 'id'>) }) : null;
}

export async function getLetterReply(letterId: string): Promise<LetterReplyDoc | null> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'letters', letterId, 'reply', 'main'));
  return snap.exists() ? (snap.data() as LetterReplyDoc) : null;
}

type Person = { uid: string; nickname: string; photoURL: string | null };

/** 편지 생성 + 펫을 away로 바꾸는 걸 한 트랜잭션으로 묶는다 — 연속으로
 * 두 번 빠르게 보내려는 시도가 같은(아직 idle로 보이는) 펫으로 편지
 * 두 통을 만들어버리는 경쟁 상태를 막는다. 손상 확률 롤/답장 대기시각
 * 계산은 여기서 하지 않는다 — functions/index.js의 onLetterCreated가
 * 서버에서 채운다(클라이언트가 나쁜 롤을 스스로 조작 못 하게). */
export async function sendLetter(input: {
  from: Person;
  to: Person;
  pet: PetDoc;
  body: string;
  waitHours: number;
}): Promise<string> {
  const database = requireDb();
  const letterRef = doc(collection(database, 'letters'));
  const petRef = doc(database, 'users', input.from.uid, 'pets', input.pet.id);
  const trimmedBody = input.body.trim();

  await runTransaction(database, async (tx) => {
    const petSnap = await tx.get(petRef);
    if (!petSnap.exists() || petSnap.data().status !== 'idle') {
      throw new PetBusyError();
    }
    tx.set(letterRef, {
      fromUid: input.from.uid,
      fromNickname: input.from.nickname,
      fromPhotoURL: input.from.photoURL,
      fromPetId: input.pet.id,
      fromPetSpecies: input.pet.species,
      fromPetName: input.pet.name,
      toUid: input.to.uid,
      toNickname: input.to.nickname,
      toPhotoURL: input.to.photoURL,
      body: trimmedBody,
      waitHours: input.waitHours,
      replyDeadline: null,
      outboundDamage: null as DamageLevel | null,
      status: 'awaiting_reply',
      createdAt: serverTimestamp(),
      repliedAt: null,
      expiredAt: null,
    });
    tx.update(petRef, { status: 'away', currentLetterId: letterRef.id });
  });

  return letterRef.id;
}

/** letters/{letterId}/reply/main — 문서 ID를 'main'으로 고정해서, 두 번째
 * 답장 시도는 자동으로 create가 아니라 update가 되어 규칙에서 거부된다
 * (LetterReplyDoc 주석 참고). */
export async function submitReply(letterId: string, body: string): Promise<void> {
  const database = requireDb();
  await setDoc(doc(database, 'letters', letterId, 'reply', 'main'), {
    body: body.trim(),
    damage: null as DamageLevel | null,
    createdAt: serverTimestamp(),
  });
}
