import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from '@firebase/firestore';

import type { WaitMinutes } from '@/constants/pets';
import { db } from '@/lib/firebase';
import { getUserProfilesByUids } from '@/data/users';
import type { LetterDoc, LetterKind, LetterReplyDoc } from '@/types/letter';
import type { PetDoc } from '@/types/pet';
import { lastActivityMs, letterSortMs } from '@/utils/letters';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

/** sendLetter가 트랜잭션 안에서 펫이 idle인지 확인하다가 이미 away인 걸
 * 발견하면 던진다 — 화면 목록이 조금 낡아있어도(예: 다른 탭에서 방금
 * 보냈음) 실제로 편지가 중복 생성되지 않게 막아준다. */
export class PetBusyError extends Error {}

function toLetter(d: QueryDocumentSnapshot<DocumentData>): LetterDoc {
  return { id: d.id, ...(d.data() as Omit<LetterDoc, 'id'>) };
}

export async function getLetter(letterId: string): Promise<LetterDoc | null> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'letters', letterId));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<LetterDoc, 'id'>) } : null;
}

/** 개편 전 답장은 부모 편지에 사본(reply)이 없다 — 그때만 서브문서를 직접 읽는다. */
export async function getLegacyReply(letterId: string): Promise<LetterReplyDoc | null> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'letters', letterId, 'reply', 'main'));
  return snap.exists() ? (snap.data() as LetterReplyDoc) : null;
}

const CONVERSATION_PAGE = 50;

/**
 * 두 사람 사이 대화창. "내가 보낸 것"과 "받은 것"을 각각 실시간으로 구독해서
 * 시간순으로 합친다 — 보안 규칙이 fromUid/toUid가 나인 편지만 읽게 해서, 한
 * 쿼리로 양방향을 다 가져올 수는 없다(각 쿼리가 규칙 조건을 그대로 담고 있어야
 * 목록 읽기가 허용된다). 상대가 보낸 편지/답장이 서버에서 처리되면 바로 반영된다.
 */
export function subscribeConversation(
  myUid: string,
  otherUid: string,
  onChange: (letters: LetterDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const database = requireDb();
  let sent: LetterDoc[] = [];
  let received: LetterDoc[] = [];
  let sentReady = false;
  let receivedReady = false;

  const emit = () => {
    if (!sentReady || !receivedReady) return;
    const merged = [...sent, ...received].sort((a, b) => letterSortMs(a) - letterSortMs(b));
    onChange(merged);
  };

  const sentQuery = query(
    collection(database, 'letters'),
    where('fromUid', '==', myUid),
    where('toUid', '==', otherUid),
    orderBy('createdAt', 'desc'),
    limit(CONVERSATION_PAGE)
  );
  const receivedQuery = query(
    collection(database, 'letters'),
    where('fromUid', '==', otherUid),
    where('toUid', '==', myUid),
    orderBy('createdAt', 'desc'),
    limit(CONVERSATION_PAGE)
  );

  const unsubSent = onSnapshot(
    sentQuery,
    (snap) => {
      sent = snap.docs.map(toLetter);
      sentReady = true;
      emit();
    },
    (error) => onError?.(error)
  );
  const unsubReceived = onSnapshot(
    receivedQuery,
    (snap) => {
      received = snap.docs.map(toLetter);
      receivedReady = true;
      emit();
    },
    (error) => onError?.(error)
  );

  return () => {
    unsubSent();
    unsubReceived();
  };
}

export type ConversationSummary = {
  otherUid: string;
  nickname: string;
  photoURL: string | null;
  /** 가장 최근에 오간 편지(답장 포함 기준). */
  latest: LetterDoc;
  latestAtMs: number;
  /** 상대 펫이 지금 내 곁에서 답장을 기다리는 편지. */
  theirWaiting: LetterDoc | null;
  /** 내 펫이 지금 상대 곁에서 기다리는 편지. */
  myWaiting: LetterDoc | null;
};

const SUMMARY_SCAN = 60;

/** 편지함 목록 — 최근에 주고받은 편지를 상대별로 묶어 대화방 목록으로 만든다. */
export async function listConversations(uid: string): Promise<ConversationSummary[]> {
  const database = requireDb();
  const [receivedSnap, sentSnap] = await Promise.all([
    getDocs(query(collection(database, 'letters'), where('toUid', '==', uid), orderBy('createdAt', 'desc'), limit(SUMMARY_SCAN))),
    getDocs(query(collection(database, 'letters'), where('fromUid', '==', uid), orderBy('createdAt', 'desc'), limit(SUMMARY_SCAN))),
  ]);

  const byOther = new Map<string, ConversationSummary>();
  const consider = (letter: LetterDoc, mine: boolean) => {
    const otherUid = mine ? letter.toUid : letter.fromUid;
    const atMs = lastActivityMs(letter);
    const current = byOther.get(otherUid);
    const waiting = letter.status === 'awaiting_reply';
    if (!current) {
      byOther.set(otherUid, {
        otherUid,
        nickname: mine ? letter.toNickname : letter.fromNickname,
        photoURL: mine ? letter.toPhotoURL : letter.fromPhotoURL,
        latest: letter,
        latestAtMs: atMs,
        theirWaiting: !mine && waiting ? letter : null,
        myWaiting: mine && waiting ? letter : null,
      });
      return;
    }
    if (atMs > current.latestAtMs) {
      current.latest = letter;
      current.latestAtMs = atMs;
    }
    if (!mine && waiting && !current.theirWaiting) current.theirWaiting = letter;
    if (mine && waiting && !current.myWaiting) current.myWaiting = letter;
  };
  receivedSnap.docs.map(toLetter).forEach((l) => consider(l, false));
  sentSnap.docs.map(toLetter).forEach((l) => consider(l, true));

  const summaries = Array.from(byOther.values());
  // 편지에 박힌 이름/사진 대신 "지금" 프로필로 덮어쓴다(다른 목록들과 같은 이유).
  const profiles = await getUserProfilesByUids(summaries.map((s) => s.otherUid));
  for (const s of summaries) {
    const p = profiles.get(s.otherUid);
    if (p) {
      s.nickname = p.nickname;
      s.photoURL = p.photoURL;
    }
  }
  return summaries.sort((a, b) => b.latestAtMs - a.latestAtMs);
}

type Person = { uid: string };

/** 편지 생성 + 펫을 away로 바꾸는 걸 한 트랜잭션으로 묶는다 — 연속으로
 * 두 번 빠르게 보내려는 시도가 같은(아직 idle로 보이는) 펫으로 편지
 * 두 통을 만들어버리는 경쟁 상태를 막는다. 손상 추첨/복귀 시각/성격 행동은
 * 서버(functions/letters-core.js의 handleLetterCreated)가 정한다.
 * kind가 summon_response면 "펫 보내줘" 호출에 응답해 메시지 없이 펫만 보낸다.
 *
 * 보낸 사람/받는 사람 이름·사진과 펫 이름은 보안 규칙이 "실제 문서와 같은지"
 * 확인하므로, 화면이 들고 있던 값 대신 트랜잭션 안에서 방금 읽은 값을 쓴다 —
 * 화면을 연 뒤에 누가 프로필을 바꿨어도 전송이 엉뚱하게 거부되지 않는다. */
export async function sendLetter(input: {
  from: Person;
  to: Person;
  pet: Pick<PetDoc, 'id'>;
  body: string;
  waitMinutes: WaitMinutes;
  kind?: LetterKind;
}): Promise<string> {
  const database = requireDb();
  const letterRef = doc(collection(database, 'letters'));
  const petRef = doc(database, 'users', input.from.uid, 'pets', input.pet.id);
  const kind: LetterKind = input.kind ?? 'letter';

  await runTransaction(database, async (tx) => {
    const [petSnap, fromSnap, toSnap] = await Promise.all([
      tx.get(petRef),
      tx.get(doc(database, 'users', input.from.uid)),
      tx.get(doc(database, 'users', input.to.uid)),
    ]);
    if (!petSnap.exists() || petSnap.data().status !== 'idle') {
      throw new PetBusyError();
    }
    const from = fromSnap.data() ?? {};
    const to = toSnap.data() ?? {};
    tx.set(letterRef, {
      kind,
      fromUid: input.from.uid,
      fromNickname: from.nickname ?? '',
      fromPhotoURL: from.photoURL ?? null,
      fromPetId: input.pet.id,
      fromPetSpecies: petSnap.data().species,
      fromPetName: petSnap.data().name,
      toUid: input.to.uid,
      toNickname: to.nickname ?? '',
      toPhotoURL: to.photoURL ?? null,
      body: kind === 'summon_response' ? '' : input.body.trim(),
      waitMinutes: input.waitMinutes,
      replyDeadline: null,
      outboundDamage: null,
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
 * 답장 시도는 자동으로 create가 아니라 update가 되어 규칙에서 거부된다. */
export async function submitReply(letterId: string, body: string): Promise<void> {
  const database = requireDb();
  await setDoc(doc(database, 'letters', letterId, 'reply', 'main'), {
    body: body.trim(),
    damage: null,
    createdAt: serverTimestamp(),
  });
}
