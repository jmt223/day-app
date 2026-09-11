import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  type QueryConstraint,
} from '@firebase/firestore';
import { ref, uploadBytes } from '@firebase/storage';

import { db, storage } from '@/lib/firebase';
import { t } from '@/i18n/store';
import { sendNotification } from '@/data/notifications';
import { bumpDayCount, getUserProfilesByUids } from '@/data/users';
import type { DayDoc, NewDayInput } from '@/types/day';
import { isFutureLabel, isWritableNow, kstLabelToTimestamp, monthRangeLabels, todayKstLabel } from '@/utils/date';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

function requireStorage() {
  if (!storage) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return storage;
}

export class WriteWindowClosedError extends Error {}

type Author = { uid: string; nickname: string; photoURL: string | null };

/**
 * DAY 사진을 업로드하고, 공개 다운로드 URL이 아니라 Storage 경로(raw path)를
 * 반환한다.
 *
 * 예전엔 여기서 getDownloadURL()로 공개 링크를 만들어 Firestore에 저장했는데,
 * 그 링크는 한번 발급되면 보안 규칙과 무관하게 토큰을 아는 사람은 영원히
 * 접근 가능했다(공개범위를 나중에 잠가도 이미 나간 링크는 안 죽음). 게다가
 * Storage 규칙만으로는 "친구공개"/"특정그룹"처럼 뷰어별 관계를 실시간으로
 * 확인할 수도 없었다.
 *
 * 지금은 공개 링크를 아예 만들지 않는다. 저장하는 건 Storage 경로 문자열
 * 뿐이고, 화면에 표시할 땐 매번 servePhoto Cloud Function(functions/index.js)을
 * 거쳐서 그 순간의 Firestore 공개범위를 서버가 직접 확인한 뒤에만 사진
 * 바이트를 받아온다. 그래서 공개범위를 안 바꿔도 애초에 유출될 "공개 링크"
 * 자체가 없다.
 */
async function uploadDayPhoto(uid: string, dayId: string, localUri: string): Promise<string> {
  const st = requireStorage();
  const response = await fetch(localUri);
  const blob = await response.blob();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const storageRef = ref(st, `days/${uid}/${dayId}/${fileName}`);
  await uploadBytes(storageRef, blob);
  return storageRef.fullPath;
}

export async function createDay(input: NewDayInput, author: Author): Promise<string> {
  const isFuture = isFutureLabel(input.dateLabel);
  if (!isFuture && !isWritableNow(input.dateLabel)) {
    throw new WriteWindowClosedError(t('write.writeWindowClosed'));
  }
  // 미래 날짜는 "예정(draft)"으로 만든다 — 그 날짜가 될 때까지는 아직
  // 기록이 아니라서, dayCount 집계나 태그 알림 같은 부수 효과는 실제로
  // 확정될 때(confirmDay)까지 미룬다.
  const status: DayDoc['status'] = isFuture ? 'draft' : 'confirmed';

  const database = requireDb();
  // 사진 경로에 dayId를 넣으려면 문서를 만들기 전에 ID가 필요하다. addDoc 대신
  // 미리 ref를 만들어 id를 얻고, setDoc으로 그 id에 직접 쓴다.
  const docRef = doc(collection(database, 'days'));
  const photoURLs = await Promise.all(
    input.photoLocalUris.map((uri) => uploadDayPhoto(author.uid, docRef.id, uri))
  );

  await setDoc(docRef, {
    authorId: author.uid,
    authorNickname: author.nickname,
    authorPhotoURL: author.photoURL,
    date: kstLabelToTimestamp(input.dateLabel),
    dateLabel: input.dateLabel,
    title: input.title.trim(),
    contentBlocks: input.contentBlocks,
    photoURLs,
    photoAspects: input.photoAspects,
    visibility: input.visibility,
    groupId: input.groupId,
    taggedFriendUids: input.taggedFriends.map((f) => f.uid),
    taggedFriendNicknames: input.taggedFriends.map((f) => f.nickname),
    moodTag: input.moodTag,
    location: input.location,
    fontKey: input.fontKey,
    textAlign: input.textAlign,
    inWorldFeed: input.inWorldFeed,
    inHistory: input.inHistory,
    likeCount: 0,
    commentCount: 0,
    editCount: 0,
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deleted: false,
  });

  if (status === 'confirmed') {
    await bumpDayCount(author.uid, 1).catch(() => undefined);
    await Promise.all(
      input.taggedFriends.map((friend) =>
        sendNotification(friend.uid, {
          type: 'tag',
          fromUid: author.uid,
          fromNickname: author.nickname,
          dayId: docRef.id,
          dayTitle: input.title.trim(),
        }).catch(() => undefined)
      )
    );
  }

  return docRef.id;
}

/**
 * contentBlocks/photoAspects가 생기기 전(글+사진 교차 레이아웃 도입 전)에
 * 작성된 옛날 DAY 문서를 새 형식으로 맞춰준다. 예전엔 본문이 단순 문자열
 * (body)이었고 사진은 항상 상단 캐러셀로 따로 보여줬으니, "본문 텍스트 한
 * 블록 + 그 뒤에 사진 블록들" 순서로 합성해서 지금 화면에서도 깨지지 않고
 * 보이게 한다. contentBlocks가 이미 있는 문서(새로 쓴 DAY)는 그대로 둔다.
 */
function normalizeDay(id: string, raw: any): DayDoc {
  const legacyBody = typeof raw.body === 'string' ? raw.body : '';
  const photoURLs = (raw.photoURLs as string[] | undefined) ?? [];
  const contentBlocks =
    (raw.contentBlocks as DayDoc['contentBlocks'] | undefined) ??
    [
      ...(legacyBody ? [{ type: 'text' as const, text: legacyBody }] : []),
      ...photoURLs.map((_, i) => ({ type: 'photo' as const, photoIndex: i })),
    ];
  const photoAspects = (raw.photoAspects as DayDoc['photoAspects'] | undefined) ?? photoURLs.map(() => 'landscape' as const);
  return { ...(raw as Omit<DayDoc, 'id'>), id, contentBlocks, photoAspects };
}

/**
 * 작성자/태그된 친구의 닉네임·사진을 "지금" 값으로 덧씌운다. DAY 문서 자체에는
 * 작성 당시 값이 그대로 남아있지만(비정규화), 화면에는 항상 최신 프로필을
 * 보여주기 위해 목록을 반환하기 직전에 이 작업을 거친다.
 */
async function withFreshProfiles(days: DayDoc[]): Promise<DayDoc[]> {
  if (days.length === 0) return days;
  const uids = days.flatMap((d) => [d.authorId, ...d.taggedFriendUids]);
  const profiles = await getUserProfilesByUids(uids);
  return days.map((d) => {
    const author = profiles.get(d.authorId);
    const taggedFriendNicknames = d.taggedFriendUids.map(
      (uid, i) => profiles.get(uid)?.nickname ?? d.taggedFriendNicknames[i] ?? '알 수 없음'
    );
    return {
      ...d,
      authorNickname: author?.nickname ?? d.authorNickname,
      authorPhotoURL: author ? author.photoURL : d.authorPhotoURL,
      taggedFriendNicknames,
    };
  });
}

export async function getDay(dayId: string): Promise<DayDoc | null> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'days', dayId));
  if (!snap.exists()) return null;
  const day = normalizeDay(snap.id, snap.data());
  const [fresh] = await withFreshProfiles([day]);
  return fresh;
}

async function mapDocs(snap: Awaited<ReturnType<typeof getDocs>>): Promise<DayDoc[]> {
  const days = snap.docs.map((d) => normalizeDay(d.id, d.data()));
  return withFreshProfiles(days);
}

export async function listWorldDaysToday(limitCount = 10): Promise<DayDoc[]> {
  const database = requireDb();
  const q = query(
    collection(database, 'days'),
    where('visibility', '==', 'public'),
    where('inWorldFeed', '==', true),
    where('status', '==', 'confirmed'),
    where('deleted', '==', false),
    where('dateLabel', '==', todayKstLabel()),
    orderBy('likeCount', 'desc'),
    limit(limitCount)
  );
  return mapDocs(await getDocs(q));
}

export async function listWorldDaysNew(limitCount = 10): Promise<DayDoc[]> {
  const database = requireDb();
  const q = query(
    collection(database, 'days'),
    where('visibility', '==', 'public'),
    where('inWorldFeed', '==', true),
    where('status', '==', 'confirmed'),
    where('deleted', '==', false),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  return mapDocs(await getDocs(q));
}

/**
 * 메인화면의 "친구 DAY" — 내가 팔로우(친구 추가)한 사람들의 게시글을 한데
 * 모은 피드. 개별 친구의 연혁 페이지(listFriendDaysTimeline)와 달리 특정
 * 한 명이 아니라 친구 전체를 대상으로 하고, 최신순으로 섞어서 보여준다.
 *
 * Firestore는 한 쿼리에 'in' 절을 두 개 이상 못 써서(authorId in [...] +
 * visibility in [...] 조합 불가), 공개범위별로 쿼리를 나눠 authorId만
 * 'in'으로 걸고 합친다. 그룹공개(visibility=='group') 게시물은 그 친구가
 * 나를 어느 그룹에 넣었는지까지 봐야 해서 목록당 추가 조회가 필요한데,
 * 피드 하나 그리려고 친구 수만큼 조회하는 건 과하다고 판단해 이 피드에는
 * 전체공개/친구공개만 담는다 — 그룹공개 게시물은 그 친구의 개별 연혁
 * 페이지에서는 정상적으로 보인다.
 */
export async function listFriendsFeed(friendUids: string[], limitCount = 10): Promise<DayDoc[]> {
  if (friendUids.length === 0) return [];
  const database = requireDb();
  // Firestore의 'in' 절은 최대 30개까지만 지원한다. 친구가 그보다 많으면
  // 최근에 추가한 친구부터 우선순위를 둘 이유가 없어 그냥 앞의 30명만
  // 대상으로 한다.
  const uids = friendUids.slice(0, 30);
  const baseConstraints = [
    where('authorId', 'in', uids),
    where('status', '==', 'confirmed'),
    where('deleted', '==', false),
  ];
  const [publicSnap, friendsSnap] = await Promise.all([
    getDocs(query(collection(database, 'days'), ...baseConstraints, where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(limitCount))),
    getDocs(query(collection(database, 'days'), ...baseConstraints, where('visibility', '==', 'friends'), orderBy('createdAt', 'desc'), limit(limitCount))),
  ]);
  const days = [...publicSnap.docs, ...friendsSnap.docs].map((d) => normalizeDay(d.id, d.data()));
  days.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  return withFreshProfiles(days.slice(0, limitCount));
}

/**
 * "더보기"를 누를 때마다 limit만 키워서 처음부터 다시 불러오는 홈
 * 화면(WorldDayScreen)의 미리보기 방식은, 사람이 늘고 DAY가 쌓일수록
 * "다시 불러오는 양"이 계속 커지는 데다 결과도 가로 스크롤 한 줄에
 * 쌓여서 찾기 힘들어진다. "전체보기" 화면(day-list.tsx)에서는 대신 매번
 * 마지막으로 받은 항목의 정렬 기준 값(createdAt)만 커서로 들고 다니며
 * "그 다음 페이지만" 딱 필요한 만큼만 더 읽어온다.
 */
export type DayListPage = { days: DayDoc[]; nextCursor: number | null };

export async function listWorldDaysNewPage(pageSize: number, cursorMs?: number | null): Promise<DayListPage> {
  const database = requireDb();
  const constraints: QueryConstraint[] = [
    where('visibility', '==', 'public'),
    where('inWorldFeed', '==', true),
    where('status', '==', 'confirmed'),
    where('deleted', '==', false),
    orderBy('createdAt', 'desc'),
  ];
  if (cursorMs) constraints.push(startAfter(Timestamp.fromMillis(cursorMs)));
  const snap = await getDocs(query(collection(database, 'days'), ...constraints, limit(pageSize)));
  const days = await mapDocs(snap);
  const lastDoc = snap.docs[snap.docs.length - 1];
  const lastMs = (lastDoc?.data().createdAt as Timestamp | undefined)?.toMillis() ?? null;
  return { days, nextCursor: snap.docs.length === pageSize ? lastMs : null };
}

/** 좋아요 순은 동점이 흔해서(0개/1개짜리가 많음) likeCount 하나만 커서로
 * 쓰면 페이지 경계에서 같은 값을 가진 다른 글을 건너뛰거나 중복으로 다시
 * 보여줄 수 있다 — 그래도 "오늘의 인기 DAY"는 그날 하루로 범위가 이미
 * 좁혀져 있어 실질적 영향이 작다고 보고, 새 복합 색인까지는 만들지
 * 않았다. */
export async function listWorldDaysTodayPage(pageSize: number, cursorLikeCount?: number | null): Promise<DayListPage> {
  const database = requireDb();
  const constraints: QueryConstraint[] = [
    where('visibility', '==', 'public'),
    where('inWorldFeed', '==', true),
    where('status', '==', 'confirmed'),
    where('deleted', '==', false),
    where('dateLabel', '==', todayKstLabel()),
    orderBy('likeCount', 'desc'),
  ];
  if (cursorLikeCount !== null && cursorLikeCount !== undefined) constraints.push(startAfter(cursorLikeCount));
  const snap = await getDocs(query(collection(database, 'days'), ...constraints, limit(pageSize)));
  const days = await mapDocs(snap);
  const lastDoc = snap.docs[snap.docs.length - 1];
  const lastLikeCount = (lastDoc?.data().likeCount as number | undefined) ?? null;
  return { days, nextCursor: snap.docs.length === pageSize ? lastLikeCount : null };
}

/** 친구 DAY 전체보기 페이지네이션. listFriendsFeed와 같은 이유로 공개/
 * 친구공개 두 쿼리를 따로 커서를 들고 페이지마다 각각 pageSize만큼
 * 새로 읽어와 합친 뒤 상위 pageSize만 보여준다 — 정확히 "N개씩 딱
 * 맞아떨어지는" 페이지는 아니지만(한쪽에 글이 몰려 있으면 어느 페이지엔
 * 적게 나올 수 있음), 이미 읽은 항목을 다시 읽거나 완전히 건너뛰는 일은
 * 없다. */
export type FriendFeedCursor = { publicMs: number | null; friendsMs: number | null };

export async function listFriendsFeedPage(
  friendUids: string[],
  pageSize: number,
  cursor?: FriendFeedCursor | null
): Promise<{ days: DayDoc[]; nextCursor: FriendFeedCursor | null }> {
  if (friendUids.length === 0) return { days: [], nextCursor: null };
  const database = requireDb();
  const uids = friendUids.slice(0, 30);
  const baseConstraints: QueryConstraint[] = [
    where('authorId', 'in', uids),
    where('status', '==', 'confirmed'),
    where('deleted', '==', false),
  ];
  const publicConstraints = [...baseConstraints, where('visibility', '==', 'public'), orderBy('createdAt', 'desc')];
  if (cursor?.publicMs) publicConstraints.push(startAfter(Timestamp.fromMillis(cursor.publicMs)));
  const friendsConstraints = [...baseConstraints, where('visibility', '==', 'friends'), orderBy('createdAt', 'desc')];
  if (cursor?.friendsMs) friendsConstraints.push(startAfter(Timestamp.fromMillis(cursor.friendsMs)));

  const [publicSnap, friendsSnap] = await Promise.all([
    getDocs(query(collection(database, 'days'), ...publicConstraints, limit(pageSize))),
    getDocs(query(collection(database, 'days'), ...friendsConstraints, limit(pageSize))),
  ]);

  const days = [...publicSnap.docs, ...friendsSnap.docs].map((d) => normalizeDay(d.id, d.data()));
  days.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));

  const lastPublic = publicSnap.docs[publicSnap.docs.length - 1];
  const lastFriends = friendsSnap.docs[friendsSnap.docs.length - 1];
  const hasMore = publicSnap.docs.length === pageSize || friendsSnap.docs.length === pageSize;

  return {
    days: await withFreshProfiles(days.slice(0, pageSize)),
    nextCursor: hasMore
      ? {
          publicMs:
            publicSnap.docs.length === pageSize
              ? ((lastPublic?.data().createdAt as Timestamp | undefined)?.toMillis() ?? null)
              : (cursor?.publicMs ?? null),
          friendsMs:
            friendsSnap.docs.length === pageSize
              ? ((lastFriends?.data().createdAt as Timestamp | undefined)?.toMillis() ?? null)
              : (cursor?.friendsMs ?? null),
        }
      : null,
  };
}

/** 남이 쓴 DAY에 태그됐을 때 "내 연혁에도 추가"를 선택하면 users/{uid}/
 * historyLinks/{dayId}에 연결만 남는다(내용은 복사 안 함) — 이 함수가 그
 * 연결을 실제 DAY 문서로 되돌린다. 그 사이 원본이 지워지거나(소프트
 * 삭제) 공개범위가 바뀌어 더 이상 못 읽게 됐으면 조용히 건너뛴다(다른
 * 사람의 삭제/설정 변경 때문에 내 화면에 에러가 뜨면 안 되니까). */
async function resolveHistoryLinks(uid: string): Promise<DayDoc[]> {
  const database = requireDb();
  const linksSnap = await getDocs(collection(database, 'users', uid, 'historyLinks'));
  if (linksSnap.empty) return [];
  const days = await Promise.all(
    linksSnap.docs.map((linkDoc) => getDoc(doc(database, 'days', linkDoc.id)).catch(() => null))
  );
  const resolved = days
    .filter((d): d is NonNullable<typeof d> => !!d && d.exists())
    .map((d) => normalizeDay(d.id, d.data()))
    .filter((d) => !d.deleted);
  return withFreshProfiles(resolved);
}

export async function listMyDaysInMonth(uid: string, year: number, month1to12: number): Promise<DayDoc[]> {
  const database = requireDb();
  const { startLabel, endLabelExclusive } = monthRangeLabels(year, month1to12);
  const q = query(
    collection(database, 'days'),
    where('authorId', '==', uid),
    where('inHistory', '==', true),
    where('status', '==', 'confirmed'),
    where('deleted', '==', false),
    where('date', '>=', kstLabelToTimestamp(startLabel)),
    where('date', '<', kstLabelToTimestamp(endLabelExclusive)),
    orderBy('date', 'asc')
  );
  const [ownDays, linkedDays] = await Promise.all([mapDocs(await getDocs(q)), resolveHistoryLinks(uid)]);
  const startMs = kstLabelToTimestamp(startLabel).toMillis();
  const endMs = kstLabelToTimestamp(endLabelExclusive).toMillis();
  const linkedInMonth = linkedDays.filter((d) => {
    const ms = d.date?.toMillis() ?? 0;
    return ms >= startMs && ms < endMs;
  });
  const merged = [...ownDays, ...linkedInMonth];
  merged.sort((a, b) => (a.date?.toMillis() ?? 0) - (b.date?.toMillis() ?? 0));
  return merged;
}

export async function listMyDaysTimeline(uid: string, limitCount = 50): Promise<DayDoc[]> {
  const database = requireDb();
  const q = query(
    collection(database, 'days'),
    where('authorId', '==', uid),
    where('inHistory', '==', true),
    where('status', '==', 'confirmed'),
    where('deleted', '==', false),
    orderBy('date', 'desc'),
    limit(limitCount)
  );
  const [ownDays, linkedDays] = await Promise.all([mapDocs(await getDocs(q)), resolveHistoryLinks(uid)]);
  const merged = [...ownDays, ...linkedDays];
  merged.sort((a, b) => (b.date?.toMillis() ?? 0) - (a.date?.toMillis() ?? 0));
  return merged.slice(0, limitCount);
}

/**
 * "내 연혁"의 타임라인 뷰는 예전엔 limitCount(기본 50)까지만 가져오고
 * 그 이상을 볼 방법이 아예 없었다 — DAY를 50개 넘게 쓴 사람은 오래된
 * 기록에 다시는 접근할 수 없는 상태였다. 이 함수는 date 값을 커서로
 * 들고 다니며 "그 다음 페이지"만 추가로 읽어온다. historyLinks(태그된
 * DAY를 내 연혁에도 추가한 것)는 한 사람당 몇 개 안 될 거라 보고 매
 * 페이지 전체를 다시 읽되, 이미 이 페이지에서 보여준 적 있는 항목만
 * 걸러낸다.
 */
export async function listMyDaysTimelinePage(
  uid: string,
  pageSize: number,
  cursorMs?: number | null,
  seenLinkedIds: string[] = []
): Promise<DayListPage> {
  const database = requireDb();
  const constraints: QueryConstraint[] = [
    where('authorId', '==', uid),
    where('inHistory', '==', true),
    where('status', '==', 'confirmed'),
    where('deleted', '==', false),
    orderBy('date', 'desc'),
  ];
  if (cursorMs) constraints.push(startAfter(Timestamp.fromMillis(cursorMs)));
  const [ownSnap, linkedDays] = await Promise.all([
    getDocs(query(collection(database, 'days'), ...constraints, limit(pageSize))),
    cursorMs ? Promise.resolve([]) : resolveHistoryLinks(uid), // 첫 페이지에서만 합친다
  ]);
  const ownDays = await mapDocs(ownSnap);
  const freshLinked = linkedDays.filter((d) => !seenLinkedIds.includes(d.id));
  const merged = [...ownDays, ...freshLinked];
  merged.sort((a, b) => (b.date?.toMillis() ?? 0) - (a.date?.toMillis() ?? 0));

  const lastOwnDoc = ownSnap.docs[ownSnap.docs.length - 1];
  const lastMs = (lastOwnDoc?.data().date as Timestamp | undefined)?.toMillis() ?? null;
  return { days: merged, nextCursor: ownSnap.docs.length === pageSize ? lastMs : null };
}

/** 이 DAY가 지금 내 연혁에도 연결돼 있는지. */
export async function isInMyHistory(uid: string, dayId: string): Promise<boolean> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'users', uid, 'historyLinks', dayId));
  return snap.exists();
}

/** 태그된 DAY를 내 연혁에도 추가한다(내용을 복사하지 않고 연결만 남김 —
 * resolveHistoryLinks 참고). */
export async function addToMyHistory(uid: string, day: Pick<DayDoc, 'id' | 'authorId'>): Promise<void> {
  const database = requireDb();
  await setDoc(doc(database, 'users', uid, 'historyLinks', day.id), {
    dayId: day.id,
    authorId: day.authorId,
    addedAt: serverTimestamp(),
  });
}

export async function removeFromMyHistory(uid: string, dayId: string): Promise<void> {
  const database = requireDb();
  await deleteDoc(doc(database, 'users', uid, 'historyLinks', dayId));
}

/** viewerUid가 friendUid의 friends 목록에 있는지, 있다면 어느 그룹으로
 * 등록돼 있는지. "친구의 연혁 보기"에서 그 친구가 나에게 실제로 공개한
 * 범위만 정확히 걸러내려면 필요하다(공개범위 판단 기준은 Firestore 규칙의
 * canReadDayData와 동일하게 맞춘다). */
async function getFriendRelation(viewerUid: string, friendUid: string): Promise<{ isFriend: boolean; myGroupId: string | null }> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'users', friendUid, 'friends', viewerUid));
  if (!snap.exists()) return { isFriend: false, myGroupId: null };
  return { isFriend: true, myGroupId: (snap.data().groupId as string | undefined) ?? null };
}

/**
 * 친구의 DAY 중 나에게 공개된 것만 가져온다. Firestore 쿼리 하나로 "전체공개
 * 이거나, 친구공개(내가 친구일 때)이거나, 특정 그룹공개(내가 그 그룹일
 * 때)"를 표현하기보다, 조건별로 쿼리를 나눠 따로 돌리고 합친다 — 이렇게
 * 하면 이 앱의 다른 목록 쿼리들과 같은 단순한 형태라 필요한 색인도
 * 예측하기 쉽다.
 */
async function listFriendDaysByVisibility(
  friendUid: string,
  isFriend: boolean,
  myGroupId: string | null,
  extraConstraints: QueryConstraint[],
  direction: 'asc' | 'desc',
  limitCount: number
): Promise<DayDoc[]> {
  const database = requireDb();
  const baseConstraints: QueryConstraint[] = [
    where('authorId', '==', friendUid),
    where('inHistory', '==', true),
    where('status', '==', 'confirmed'),
    where('deleted', '==', false),
    ...extraConstraints,
  ];

  const visibilityValues = isFriend ? ['public', 'friends'] : ['public'];
  const queries = [
    getDocs(
      query(
        collection(database, 'days'),
        ...baseConstraints,
        where('visibility', 'in', visibilityValues),
        orderBy('date', direction)
      )
    ),
  ];
  if (isFriend && myGroupId) {
    queries.push(
      getDocs(
        query(
          collection(database, 'days'),
          ...baseConstraints,
          where('visibility', '==', 'group'),
          where('groupId', '==', myGroupId),
          orderBy('date', direction)
        )
      )
    );
  }

  const snaps = await Promise.all(queries);
  const days = snaps.flatMap((snap) => snap.docs.map((d) => normalizeDay(d.id, d.data())));
  days.sort((a, b) => (direction === 'asc' ? a.date.toMillis() - b.date.toMillis() : b.date.toMillis() - a.date.toMillis()));
  return withFreshProfiles(days.slice(0, limitCount));
}

/** 친구가 나에게 공개한 범위 안에서, 그 친구의 특정 달 DAY 목록. */
export async function listFriendDaysInMonth(
  viewerUid: string,
  friendUid: string,
  year: number,
  month1to12: number
): Promise<DayDoc[]> {
  const { startLabel, endLabelExclusive } = monthRangeLabels(year, month1to12);
  const { isFriend, myGroupId } = await getFriendRelation(viewerUid, friendUid);
  return listFriendDaysByVisibility(
    friendUid,
    isFriend,
    myGroupId,
    [where('date', '>=', kstLabelToTimestamp(startLabel)), where('date', '<', kstLabelToTimestamp(endLabelExclusive))],
    'asc',
    500
  );
}

/** 친구가 나에게 공개한 범위 안에서, 그 친구의 연혁(타임라인) 전체. */
export async function listFriendDaysTimeline(viewerUid: string, friendUid: string, limitCount = 50): Promise<DayDoc[]> {
  const { isFriend, myGroupId } = await getFriendRelation(viewerUid, friendUid);
  return listFriendDaysByVisibility(friendUid, isFriend, myGroupId, [], 'desc', limitCount);
}

/** 내가 미래 날짜로 미리 써둔 예정(draft) DAY 목록. 날짜가 가까운 순. */
export async function listMyDrafts(uid: string): Promise<DayDoc[]> {
  const database = requireDb();
  const q = query(
    collection(database, 'days'),
    where('authorId', '==', uid),
    where('status', '==', 'draft'),
    where('deleted', '==', false),
    orderBy('date', 'asc')
  );
  return mapDocs(await getDocs(q));
}

export class ConfirmWindowError extends Error {}

/** 예정(draft)으로 써둔 DAY를 "확정"해서 실제 기록으로 만든다. 그 날짜
 * 00:00 KST부터 다음날 오전 10시까지만 가능하다(보통 DAY의 작성 시간
 * 제한과 동일한 창). 그 기한을 넘기면 영영 확정할 수 없다 — 자동으로
 * 지워지진 않지만 그냥 못 쓰게 방치된다. */
export async function confirmDay(
  day: Pick<DayDoc, 'id' | 'dateLabel' | 'authorId' | 'authorNickname' | 'taggedFriendUids' | 'title'>
): Promise<void> {
  if (!isWritableNow(day.dateLabel)) {
    throw new ConfirmWindowError(t('dayDetail.confirmWindowClosed'));
  }
  const database = requireDb();
  await updateDoc(doc(database, 'days', day.id), { status: 'confirmed', updatedAt: serverTimestamp() });

  await bumpDayCount(day.authorId, 1).catch(() => undefined);
  await Promise.all(
    day.taggedFriendUids.map((uid) =>
      sendNotification(uid, {
        type: 'tag',
        fromUid: day.authorId,
        fromNickname: day.authorNickname,
        dayId: day.id,
        dayTitle: day.title,
      }).catch(() => undefined)
    )
  );
}

export type DayEditableFields = Pick<
  DayDoc,
  'visibility' | 'groupId' | 'inWorldFeed' | 'inHistory' | 'taggedFriendUids' | 'taggedFriendNicknames'
>;

/** DAY의 공개범위·노출 설정(월드데이/연혁 포함 여부)·함께한 사람을 바꾼다.
 * 시간 제한이 없다 — 오래된 DAY라도 나중에 이런 표시 설정을 바꾸는 건
 * 자연스러운 사용 패턴이라서다. 공개범위가 바뀌어도 사진 쪽에서 따로 할 일은
 * 없다 — 사진은 애초에 공개 링크 없이 servePhoto Function을 통해서만
 * 서빙되고, 그 함수가 매 요청마다 이 DAY의 "지금" visibility를 직접
 * 확인하기 때문이다. */
export async function updateDay(dayId: string, patch: Partial<DayEditableFields>): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'days', dayId), { ...patch, updatedAt: serverTimestamp() });
}

export type DayContentEditableFields = Pick<
  DayDoc,
  'title' | 'contentBlocks' | 'moodTag' | 'location' | 'fontKey' | 'textAlign'
>;

export class EditWindowClosedError extends Error {}

/** DAY의 내용(제목/본문/기분/위치/글씨체/정렬)을 수정한다. 작성 후 24시간이 지나면
 * 보안 규칙이 거부하므로, 여기서도 미리 같은 조건으로 막아서 사용자에게 바로
 * 이유를 알려준다. 수정할 때마다 editCount를 정확히 1 늘린다(보안 규칙이
 * 그 외의 값 변화는 거부한다). */
export async function updateDayContent(
  day: Pick<DayDoc, 'id' | 'createdAt' | 'editCount'>,
  patch: Partial<DayContentEditableFields>
): Promise<void> {
  if (!day.createdAt || Date.now() - day.createdAt.toMillis() > 24 * 60 * 60 * 1000) {
    throw new EditWindowClosedError(t('dayDetail.editWindowClosedMessage'));
  }
  const database = requireDb();
  await updateDoc(doc(database, 'days', day.id), {
    ...patch,
    editCount: (day.editCount ?? 0) + 1,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDay(dayId: string): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'days', dayId), { deleted: true, updatedAt: serverTimestamp() });
}

export async function hasLiked(dayId: string, uid: string): Promise<boolean> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'days', dayId, 'likes', uid));
  return snap.exists();
}

export async function toggleLike(
  dayId: string,
  liker: Author,
  dayAuthorId: string,
  dayTitle: string
): Promise<boolean> {
  const database = requireDb();
  const dayRef = doc(database, 'days', dayId);
  const likeRef = doc(database, 'days', dayId, 'likes', liker.uid);
  // "내가 좋아요한 DAY 모아보기"용 사본 — listLikedDays 주석 참고.
  const myLikeRef = doc(database, 'users', liker.uid, 'myLikes', dayId);

  const nowLiked = await runTransaction(database, async (tx) => {
    const likeSnap = await tx.get(likeRef);
    if (likeSnap.exists()) {
      tx.delete(likeRef);
      tx.delete(myLikeRef);
      tx.update(dayRef, { likeCount: increment(-1) });
      return false;
    }
    tx.set(likeRef, { uid: liker.uid, createdAt: serverTimestamp() });
    tx.set(myLikeRef, { dayId, createdAt: serverTimestamp() });
    tx.update(dayRef, { likeCount: increment(1) });
    return true;
  });

  if (nowLiked && liker.uid !== dayAuthorId) {
    await sendNotification(dayAuthorId, {
      type: 'like',
      fromUid: liker.uid,
      fromNickname: liker.nickname,
      dayId,
      dayTitle,
    }).catch(() => undefined);
  }

  return nowLiked;
}

/** 내가 좋아요를 누른 DAY 목록 (users/{uid}/myLikes 사본 기반 — 이유는
 * toggleLike의 myLikeRef 주석과 firestore.rules의 myLikes 규칙 주석 참고:
 * likes를 collectionGroup으로 직접 모아 읽으면 규칙을 어느 형태로 써도
 * permission-denied였다). */
export async function listLikedDays(uid: string, limitCount = 50): Promise<DayDoc[]> {
  const database = requireDb();
  const q = query(collection(database, 'users', uid, 'myLikes'), orderBy('createdAt', 'desc'), limit(limitCount));
  const likeSnaps = await getDocs(q);

  const dayRefs = likeSnaps.docs.map((d) => doc(database, 'days', d.id));

  // 이후 공개범위가 바뀌어 더 이상 읽을 수 없게 된 DAY는 조용히 건너뛴다.
  const dayDocs = await Promise.all(dayRefs.map((dayRef) => getDoc(dayRef).catch(() => null)));
  const days = dayDocs
    .filter((d): d is NonNullable<typeof d> => !!d && d.exists())
    .map((d) => normalizeDay(d.id, d.data()))
    .filter((d) => !d.deleted);
  return withFreshProfiles(days);
}
