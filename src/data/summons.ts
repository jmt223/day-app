import { collection, doc, getDocs, serverTimestamp, setDoc, Timestamp } from '@firebase/firestore';

import { db } from '@/lib/firebase';
import { sendNotification } from '@/data/notifications';
import type { SummonDoc } from '@/types/letter';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

/** 12시간이 지나면 화면에서 안 보이게 클라이언트가 걸러낸다 — 별도 만료
 * 스케줄 함수 없이, 문서도 (from,to) 쌍당 1개로 고정돼 있어 저장 공간이
 * 무한정 늘지도 않는다(firestore.rules의 incomingSummons 주석 참고). */
const SUMMON_VISIBLE_HOURS = 12;

export type IncomingSummon = SummonDoc;

export async function sendSummon(from: { uid: string; nickname: string; photoURL: string | null }, toUid: string): Promise<void> {
  const database = requireDb();
  // incomingSummons 문서를 먼저 확정 지어야, 알림함 사본(pet_summon)의
  // create 규칙이 요구하는 "실제로 방금 만든 호출이 있는지" exists() 검사를
  // 통과한다 — 같은 배치로 묶으면 서로를 아직 못 본 상태로 독립 검증되는
  // 문제가 있어(myComments 주석과 같은 이유) 순서대로 따로 쓴다.
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
  const cutoffMs = Date.now() - SUMMON_VISIBLE_HOURS * 60 * 60 * 1000;
  return snap.docs
    .map((d) => d.data() as IncomingSummon)
    .filter((s) => {
      const createdMs = (s.createdAt as Timestamp | null)?.toMillis() ?? 0;
      return createdMs > cutoffMs;
    });
}
