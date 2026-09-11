import { addDoc, collection, serverTimestamp } from '@firebase/firestore';

import { db } from '@/lib/firebase';
import type { ReportReason, ReportTargetType } from '@/types/user';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

/**
 * 신고를 접수한다. 신고 내용은 신고자 본인과 관리자(Firebase 콘솔)만 볼 수
 * 있고, 자동으로 뭔가 조치하지는 않는다 — 이 앱엔 별도 운영 콘솔이 없어서,
 * 지금은 "쌓아두고 나중에 직접 확인" 수준의 MVP다.
 */
export async function reportContent(
  reporterUid: string,
  params: { targetType: ReportTargetType; targetId: string; targetAuthorUid: string; reason: ReportReason; detail: string }
): Promise<void> {
  const database = requireDb();
  await addDoc(collection(database, 'reports'), {
    reporterUid,
    ...params,
    createdAt: serverTimestamp(),
  });
}
