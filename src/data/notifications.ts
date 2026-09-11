import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from '@firebase/firestore';

import { db } from '@/lib/firebase';
import { getUserProfilesByUids } from '@/data/users';
import type { AppNotification } from '@/types/user';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

type NewNotification =
  | { type: 'tag' | 'comment' | 'like'; fromUid: string; fromNickname: string; dayId: string; dayTitle: string }
  | { type: 'friend_request' | 'friend_accept'; fromUid: string; fromNickname: string }
  // letter_received/letter_replied/letter_expired는 functions/index.js가
  // Admin SDK로 직접 쓴다(편지 손상 롤 등 서버만 아는 계산이 끼어있어서) —
  // pet_summon만 클라이언트가 직접 만든다(호출 자체가 클라이언트 액션).
  | { type: 'pet_summon'; fromUid: string; fromNickname: string };

export async function sendNotification(toUid: string, data: NewNotification): Promise<void> {
  const database = requireDb();
  await addDoc(collection(database, 'users', toUid, 'notifications'), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function listNotifications(uid: string, limitCount = 50): Promise<AppNotification[]> {
  const database = requireDb();
  const q = query(collection(database, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  const notifications = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) }));

  // 보낸 사람 이름은 저장 당시 값 대신 "지금" 프로필로 덧씌운다(친구
  // 목록·댓글과 같은 이유) — 규칙이 쓰는 시점엔 실제 닉네임과 일치하도록
  // 강제하지만, 그 뒤에 닉네임을 바꿨을 수도 있고, 이 규칙이 생기기 전에
  // 저장된 옛날 알림도 있을 수 있어서다.
  const profiles = await getUserProfilesByUids(notifications.map((n) => n.fromUid));
  return notifications.map((n) => ({
    ...n,
    fromNickname: profiles.get(n.fromUid)?.nickname ?? n.fromNickname,
  }));
}

export async function markNotificationRead(uid: string, notificationId: string): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'users', uid, 'notifications', notificationId), { read: true });
}

/** 안 읽은 알림을 한 번에 전부 읽음 처리한다. 배치는 한 번에 최대 500개
 * 쓰기만 담을 수 있어서, 그보다 많으면(거의 없겠지만) 여러 배치로 나눈다. */
export async function markAllNotificationsRead(uid: string): Promise<void> {
  const database = requireDb();
  const q = query(collection(database, 'users', uid, 'notifications'), where('read', '==', false));
  const snap = await getDocs(q);
  if (snap.empty) return;

  const BATCH_LIMIT = 500;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(database);
    for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) {
      batch.update(d.ref, { read: true });
    }
    await batch.commit();
  }
}

export async function deleteNotification(uid: string, notificationId: string): Promise<void> {
  const database = requireDb();
  await deleteDoc(doc(database, 'users', uid, 'notifications', notificationId));
}

/** 안 읽은 알림 개수만 센다 — 문서를 다 받아오지 않고 서버에서 집계만
 * 해오니(getCountFromServer), 벨 아이콘 배지처럼 자주 확인하는 값을
 * 가볍게 물어볼 수 있다. */
export async function countUnreadNotifications(uid: string): Promise<number> {
  const database = requireDb();
  const q = query(collection(database, 'users', uid, 'notifications'), where('read', '==', false));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

const LETTER_NOTIFICATION_TYPES = ['letter_received', 'letter_replied', 'letter_expired', 'pet_summon'] as const;

/** 편지함 탭 배지용 — 별도 "안읽은 편지" 필드를 새로 만들지 않고, 이미
 * 있는 알림함의 read 플래그를 편지 관련 타입만 걸러서 센다. 이 종류들만
 * 걸러도 where가 전부 등호(read==false, type in [...])라 복합 색인 없이
 * 자동 색인만으로 동작한다. */
export async function countUnreadLetterNotifications(uid: string): Promise<number> {
  const database = requireDb();
  const q = query(
    collection(database, 'users', uid, 'notifications'),
    where('read', '==', false),
    where('type', 'in', LETTER_NOTIFICATION_TYPES)
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

/** 편지함 탭을 열어본 것 자체를 "확인했다"는 신호로 보고, 편지 관련
 * 안읽은 알림을 한 번에 읽음 처리한다(markAllNotificationsRead와 같은
 * 배치 청크 패턴). */
export async function markLetterNotificationsRead(uid: string): Promise<void> {
  const database = requireDb();
  const q = query(
    collection(database, 'users', uid, 'notifications'),
    where('read', '==', false),
    where('type', 'in', LETTER_NOTIFICATION_TYPES)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const BATCH_LIMIT = 500;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(database);
    for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) {
      batch.update(d.ref, { read: true });
    }
    await batch.commit();
  }
}
