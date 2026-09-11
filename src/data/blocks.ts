import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, writeBatch } from '@firebase/firestore';

import { db } from '@/lib/firebase';
import type { BlockedUser } from '@/types/user';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

/**
 * 차단한다. 양쪽 friends 문서를 다 지워서(내 쪽 + 상대방 쪽에 남아있는
 * "나") 친구 관계를 완전히 끊는다 — 한쪽만 지우면 상대는 여전히 나를
 * 친구로 둔 상태라, canReadDayData의 friendOfAuthor 판단이 그대로
 * 통과해서 내가 차단한 사람의 "친구공개"/"그룹공개" 글을 내가 계속 읽을
 * 수 있는 반쪽짜리 차단이 된다. 오간 친구 요청도 함께 정리한다.
 */
export async function blockUser(myUid: string, target: { uid: string; nickname: string }): Promise<void> {
  const database = requireDb();
  const batch = writeBatch(database);
  batch.set(doc(database, 'users', myUid, 'blocked', target.uid), {
    blockedUid: target.uid,
    blockedNickname: target.nickname,
    createdAt: serverTimestamp(),
  });
  batch.delete(doc(database, 'users', myUid, 'friends', target.uid));
  batch.delete(doc(database, 'users', target.uid, 'friends', myUid));
  batch.delete(doc(database, 'users', myUid, 'friendRequests', target.uid));
  await batch.commit();
  // 내가 상대에게 보낸 요청은 상대방 쪽 문서라 별도로 지운다(취소 규칙 있음).
  await deleteDoc(doc(database, 'users', target.uid, 'friendRequests', myUid)).catch(() => undefined);
}

export async function unblockUser(myUid: string, blockedUid: string): Promise<void> {
  const database = requireDb();
  await deleteDoc(doc(database, 'users', myUid, 'blocked', blockedUid));
}

export async function listBlockedUsers(myUid: string): Promise<BlockedUser[]> {
  const database = requireDb();
  const snap = await getDocs(collection(database, 'users', myUid, 'blocked'));
  return snap.docs.map((d) => d.data() as BlockedUser);
}

export async function isBlockedByMe(myUid: string, otherUid: string): Promise<boolean> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'users', myUid, 'blocked', otherUid));
  return snap.exists();
}

/** 세트로 받아서, 목록 화면에서 "이 작성자 차단했나?"를 매번 개별 조회 없이
 * 빠르게 확인할 수 있게 한다(월드데이 피드에서 차단한 사람 글 걸러내기 등). */
export async function listBlockedUidSet(myUid: string): Promise<Set<string>> {
  const list = await listBlockedUsers(myUid);
  return new Set(list.map((b) => b.blockedUid));
}
