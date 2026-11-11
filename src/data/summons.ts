import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from '@firebase/firestore';

import type { WaitMinutes } from '@/constants/pets';
import { db } from '@/lib/firebase';
import { sendLetter } from '@/data/letters';
import { sendNotification } from '@/data/notifications';
import type { SummonDoc } from '@/types/letter';
import type { PetDoc } from '@/types/pet';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

/** 12시간이 지나면 화면에서 안 보이게 클라이언트가 걸러낸다 — 별도 만료
 * 스케줄 함수 없이, 문서도 (from,to) 쌍당 1개로 고정돼 있어 저장 공간이
 * 무한정 늘지도 않는다(firestore.rules의 incomingSummons 주석 참고). 펫을
 * 보내서 응답한 호출은 서버가 handledAt을 채워서 역시 안 보인다. */
const SUMMON_VISIBLE_HOURS = 12;

export type IncomingSummon = SummonDoc;

function isPending(summon: SummonDoc, nowMs: number): boolean {
  const createdMs = summon.createdAt?.toMillis() ?? 0;
  return !summon.handledAt && createdMs > nowMs - SUMMON_VISIBLE_HOURS * 60 * 60 * 1000;
}

export async function sendSummon(from: { uid: string; nickname: string; photoURL: string | null }, toUid: string): Promise<void> {
  const database = requireDb();
  // incomingSummons 문서를 먼저 확정 지어야, 알림함 사본(pet_summon)의
  // create 규칙이 요구하는 "실제로 방금 만든 호출이 있는지" exists() 검사를
  // 통과한다 — 같은 배치로 묶으면 서로를 아직 못 본 상태로 독립 검증되는
  // 문제가 있어 순서대로 따로 쓴다.
  await setDoc(doc(database, 'users', toUid, 'incomingSummons', from.uid), {
    fromUid: from.uid,
    fromNickname: from.nickname,
    fromPhotoURL: from.photoURL,
    createdAt: serverTimestamp(),
  });

  await sendNotification(toUid, { type: 'pet_summon', fromUid: from.uid, fromNickname: from.nickname }).catch(() => undefined);
}

export async function listIncomingSummons(uid: string): Promise<IncomingSummon[]> {
  const database = requireDb();
  const snap = await getDocs(collection(database, 'users', uid, 'incomingSummons'));
  const now = Date.now();
  return snap.docs
    .map((d) => d.data() as IncomingSummon)
    .filter((s) => isPending(s, now))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}

/** otherUid가 나에게 보낸, 아직 응답 안 한 호출. */
export async function getPendingSummonFrom(myUid: string, otherUid: string): Promise<IncomingSummon | null> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'users', myUid, 'incomingSummons', otherUid));
  if (!snap.exists()) return null;
  const summon = snap.data() as IncomingSummon;
  return isPending(summon, Date.now()) ? summon : null;
}

/**
 * "펫 보내줘"에 응답한다 — 고른 펫이 메시지 없이 호출한 사람에게 가서, 고른
 * 대기시간 동안 그 사람의 답장을 기다린다(호출만으로 펫이 자동으로 가지는
 * 않는다). 호출이 처리됐다는 표시(handledAt)는 서버가 채운다.
 */
export async function respondToSummon(input: {
  me: { uid: string };
  summoner: { uid: string };
  pet: Pick<PetDoc, 'id'>;
  waitMinutes: WaitMinutes;
}): Promise<string> {
  return sendLetter({
    from: input.me,
    to: input.summoner,
    pet: input.pet,
    body: '',
    waitMinutes: input.waitMinutes,
    kind: 'summon_response',
  });
}
