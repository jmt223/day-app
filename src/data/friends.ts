import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc, writeBatch } from '@firebase/firestore';

import { db } from '@/lib/firebase';
import { t } from '@/i18n/store';
import type { FriendEntry, FriendRequest } from '@/types/user';
import { findUidByEmail, getUserProfilesByUids } from '@/data/users';
import { sendNotification } from '@/data/notifications';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

export class FriendLookupError extends Error {}

type Requester = { uid: string; nickname: string; photoURL: string | null };

/**
 * 친구 요청을 보낸다(예전엔 이메일로 바로 추가했는데, 상대가 모르는 채로
 * 자기 그룹에 편입되는 방식이라 지금은 요청→수락 방식으로 바꿨다). 상대가
 * 수락해야 서로의 friends 목록에 들어간다.
 */
export async function sendFriendRequest(
  requester: Requester,
  email: string,
  groupId: string,
  groupName: string
): Promise<void> {
  const database = requireDb();
  const friendUid = await findUidByEmail(email);
  if (!friendUid) {
    throw new FriendLookupError(t('friends.lookupNotFound'));
  }
  if (friendUid === requester.uid) {
    throw new FriendLookupError(t('friends.lookupSelf'));
  }

  try {
    await setDoc(doc(database, 'users', friendUid, 'friendRequests', requester.uid), {
      fromUid: requester.uid,
      fromNickname: requester.nickname,
      fromPhotoURL: requester.photoURL,
      groupId,
      groupName,
      createdAt: serverTimestamp(),
    });
  } catch {
    // 이미 이 사람에게 보낸 대기 중 요청이 있으면 create가 아니라 update로
    // 취급돼 보안 규칙이 막는다(permission-denied) — 중복 요청 스팸 방지.
    throw new FriendLookupError(t('friends.lookupAlreadyRequestedOrFriend'));
  }

  await sendNotification(friendUid, {
    type: 'friend_request',
    fromUid: requester.uid,
    fromNickname: requester.nickname,
  }).catch(() => undefined);
}

export async function listIncomingFriendRequests(uid: string): Promise<FriendRequest[]> {
  const database = requireDb();
  const snap = await getDocs(collection(database, 'users', uid, 'friendRequests'));
  const requests = snap.docs.map((d) => d.data() as FriendRequest);

  // 요청 보낼 당시의 닉네임·사진 대신 "지금" 프로필을 보여준다.
  const profiles = await getUserProfilesByUids(requests.map((r) => r.fromUid));
  return requests.map((r) => {
    const profile = profiles.get(r.fromUid);
    return {
      ...r,
      fromNickname: profile?.nickname ?? r.fromNickname,
      fromPhotoURL: profile ? profile.photoURL : r.fromPhotoURL,
    };
  });
}

/**
 * 받은 친구 요청을 수락한다. 내 쪽 friends 문서와, 상대방 쪽 friends
 * 문서(내가 상대방의 friendRequests에 아직 남아있는 동안만 쓸 수 있게
 * 허용된 특례)를 함께 만들고, 요청 문서는 지운다 — 배치로 묶어서 중간에
 * 실패해 "반쪽짜리 친구 관계"가 남지 않게 한다.
 */
export async function acceptFriendRequest(
  me: Requester,
  request: FriendRequest,
  myGroupId: string,
  myGroupName: string
): Promise<void> {
  const database = requireDb();
  const batch = writeBatch(database);

  batch.set(doc(database, 'users', me.uid, 'friends', request.fromUid), {
    friendUid: request.fromUid,
    nickname: request.fromNickname,
    photoURL: request.fromPhotoURL,
    groupId: myGroupId,
    groupName: myGroupName,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(database, 'users', request.fromUid, 'friends', me.uid), {
    friendUid: me.uid,
    nickname: me.nickname,
    photoURL: me.photoURL,
    groupId: request.groupId,
    groupName: request.groupName,
    createdAt: serverTimestamp(),
  });
  batch.delete(doc(database, 'users', me.uid, 'friendRequests', request.fromUid));

  await batch.commit();

  await sendNotification(request.fromUid, {
    type: 'friend_accept',
    fromUid: me.uid,
    fromNickname: me.nickname,
  }).catch(() => undefined);
}

export async function declineFriendRequest(uid: string, fromUid: string): Promise<void> {
  const database = requireDb();
  await deleteDoc(doc(database, 'users', uid, 'friendRequests', fromUid));
}

export async function listFriends(uid: string): Promise<FriendEntry[]> {
  const database = requireDb();
  const snap = await getDocs(collection(database, 'users', uid, 'friends'));
  const friends = snap.docs.map((d) => d.data() as FriendEntry);

  // 친구를 추가할 당시의 닉네임·사진 대신 "지금" 프로필을 보여준다.
  const profiles = await getUserProfilesByUids(friends.map((f) => f.friendUid));
  return friends.map((f) => {
    const profile = profiles.get(f.friendUid);
    return {
      ...f,
      nickname: profile?.nickname ?? f.nickname,
      photoURL: profile ? profile.photoURL : f.photoURL,
    };
  });
}

/** myUid가 otherUid를 친구로 등록해뒀는지만 가볍게 확인한다 — "펫 보내달라고
 * 하기"처럼 친구 사이에서만 의미 있는 버튼을 남의 프로필에서 보여줄지
 * 말지 정할 때 쓴다(실제 권한 검증은 firestore.rules의 friendOfAuthor가
 * 따로 하고, 이건 UI에서 미리 걸러 보여주는 용도). */
export async function isFriend(myUid: string, otherUid: string): Promise<boolean> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'users', myUid, 'friends', otherUid));
  return snap.exists();
}

/** 친구를 삭제한다. 양쪽 friends 문서를 다 지운다 — 내 쪽만 지우면
 * 상대방은 여전히 나를 친구로 둔 상태라, 내 "친구공개"/"그룹공개" 글을
 * 계속 볼 수 있는 반쪽짜리 삭제가 된다(차단과 같은 이유). */
export async function removeFriend(ownerUid: string, friendUid: string): Promise<void> {
  const database = requireDb();
  const batch = writeBatch(database);
  batch.delete(doc(database, 'users', ownerUid, 'friends', friendUid));
  batch.delete(doc(database, 'users', friendUid, 'friends', ownerUid));
  await batch.commit();
}

/** 친구를 다른 그룹으로 옮긴다. 내 쪽 friends 문서만 바뀐다 — 그룹은 각자
 * 자기 화면에서 보려고 분류해두는 개인 설정이라, 상대방 쪽 그룹 분류에는
 * 영향을 주지 않는다. */
export async function moveFriendToGroup(
  ownerUid: string,
  friendUid: string,
  groupId: string,
  groupName: string
): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'users', ownerUid, 'friends', friendUid), { groupId, groupName });
}
