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
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Query,
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
  // 편지 도착/답장/복귀/재문의 알림은 서버(functions/letters-core.js)가 Admin
  // SDK로 직접 쓴다 — pet_summon만 클라이언트가 직접 만든다(호출 자체가
  // 클라이언트 액션).
  | { type: 'pet_summon'; fromUid: string; fromNickname: string };

/** 좋아요/태그 알림은 (종류, DAY, 보낸 사람)마다 문서 ID를 하나로 고정한다 —
 * 보안 규칙이 이 ID 형식을 강제해서, 좋아요를 눌렀다 취소했다 반복해도 알림과
 * 푸시는 한 번만 간다(두 번째부터는 이미 있는 문서라 규칙이 거부한다). */
function fixedNotificationId(data: NewNotification): string | null {
  if (data.type === 'like' || data.type === 'tag') return `${data.type}_${data.dayId}_${data.fromUid}`;
  return null;
}

export async function sendNotification(toUid: string, data: NewNotification): Promise<void> {
  const database = requireDb();
  const payload = { ...data, read: false, createdAt: serverTimestamp() };
  const fixedId = fixedNotificationId(data);
  if (fixedId) {
    await setDoc(doc(database, 'users', toUid, 'notifications', fixedId), payload);
  } else {
    await addDoc(collection(database, 'users', toUid, 'notifications'), payload);
  }
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

const LETTER_NOTIFICATION_TYPES = [
  'letter_received',
  'letter_replied',
  'letter_expired',
  'pet_summon',
  'summon_accepted',
  'pet_early_return',
  'pet_overstay',
  'letter_reask',
] as const;

function unreadLetterQuery(uid: string): Query {
  return query(
    collection(requireDb(), 'users', uid, 'notifications'),
    where('read', '==', false),
    where('type', 'in', LETTER_NOTIFICATION_TYPES)
  );
}

/** 편지함 탭 배지용 — 별도 "안읽은 편지" 필드를 새로 만들지 않고, 이미
 * 있는 알림함의 read 플래그를 편지 관련 타입만 걸러서 센다. 이 종류들만
 * 걸러도 where가 전부 등호(read==false, type in [...])라 복합 색인 없이
 * 자동 색인만으로 동작한다. */
export async function countUnreadLetterNotifications(uid: string): Promise<number> {
  const snap = await getCountFromServer(unreadLetterQuery(uid));
  return snap.data().count;
}

/** 편지함 목록에서 "새 소식" 점을 찍을 상대들 — 안 읽은 편지 알림을 보낸 사람. */
export async function listUnreadLetterSenders(uid: string): Promise<Set<string>> {
  const snap = await getDocs(query(unreadLetterQuery(uid), limit(100)));
  return new Set(snap.docs.map((d) => d.data().fromUid as string));
}

async function markRead(q: Query): Promise<void> {
  const database = requireDb();
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

/** 그 사람과의 대화창을 열면, 그 사람이 보낸(또는 그 사람과의 편지에 관한)
 * 안 읽은 편지 알림을 읽음 처리한다 — 예전엔 편지함 탭을 열기만 해도 전부
 * 지워져서, 누구한테서 새 편지가 왔는지 목록에서 알 수 없었다. */
export async function markLetterNotificationsReadFrom(uid: string, otherUid: string): Promise<void> {
  await markRead(query(unreadLetterQuery(uid), where('fromUid', '==', otherUid)));
}
