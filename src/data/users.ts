import type { User as FirebaseUser } from '@firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '@firebase/firestore';

import { deleteObject, getDownloadURL, ref, uploadBytes } from '@firebase/storage';

import { auth, db, storage } from '@/lib/firebase';
import { grantStarterPet } from '@/data/pets';
import { t } from '@/i18n/store';
import type { FriendGroup, NotificationSettings, UserProfile } from '@/types/user';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

const DEFAULT_GROUPS = ['가족', '친구', '지인'];

export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

export async function ensureUserProfile(user: FirebaseUser, nickname?: string): Promise<UserProfile> {
  const database = requireDb();
  const ref = doc(database, 'users', user.uid);

  // 회원가입 직후에는 signUp()의 명시적 호출과 onAuthStateChanged 리스너의
  // 호출이 거의 동시에 들어올 수 있다. 트랜잭션으로 감싸서 둘 중 먼저 커밋된
  // 쪽의 데이터만 반영되게 하고(그 뒤에 재시도되는 쪽은 이미 있는 문서를
  // 그대로 반환), plain get-then-set에서 생기는 경쟁 상태를 없앤다.
  const profileData = await runTransaction(database, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }

    const profile: Omit<UserProfile, 'createdAt'> = {
      uid: user.uid,
      nickname: nickname?.trim() || user.displayName?.trim() || user.email?.split('@')[0] || '새로운 사용자',
      photoURL: user.photoURL,
      bio: '',
      dayCount: 0,
    };
    tx.set(ref, { ...profile, createdAt: serverTimestamp() });
    return null;
  });

  if (profileData) {
    return profileData;
  }

  if (user.email) {
    await setDoc(doc(database, 'usersByEmail', emailKey(user.email)), { uid: user.uid });
  }

  await Promise.all(
    DEFAULT_GROUPS.map((name, index) =>
      setDoc(doc(collection(database, 'users', user.uid, 'groups')), {
        name,
        order: index,
        createdAt: serverTimestamp(),
      })
    )
  );

  // 가입 시 기본 펫(참새) 지급. petCount는 users/{uid} 문서의 create
  // 규칙이 필드를 엄격히 제한해서(hasOnly) 저 위 tx.set엔 못 넣고, 여기서
  // 별도 업데이트로 채운다(grantStarterPet 참고).
  await grantStarterPet(user.uid).catch((err) => console.error('grantStarterPet failed', err));

  const created = await getDoc(ref);
  return created.data() as UserProfile;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const database = requireDb();
  const snap = await getDoc(doc(database, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

/**
 * 여러 uid의 "지금" 프로필을 한 번에 조회한다. DAY/댓글/친구 목록에는
 * 작성·추가 당시의 닉네임·사진이 복사되어 저장되는데(성능을 위한 비정규화),
 * 화면에 보여줄 때는 이 함수로 최신 값을 덧씌워서 프로필 수정이 바로
 * 반영되도록 한다.
 */
export async function getUserProfilesByUids(uids: string[]): Promise<Map<string, UserProfile>> {
  const uniqueUids = Array.from(new Set(uids.filter(Boolean)));
  if (uniqueUids.length === 0) return new Map();
  const results = await Promise.all(uniqueUids.map((uid) => getUserProfile(uid).catch(() => null)));
  const map = new Map<string, UserProfile>();
  uniqueUids.forEach((uid, i) => {
    const profile = results[i];
    if (profile) map.set(uid, profile);
  });
  return map;
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<UserProfile, 'nickname' | 'bio' | 'photoURL'>>
): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'users', uid), patch);
}

/** 이용약관·개인정보처리방침 동의를 기록한다(ConsentGate). firestore.rules가
 * 아직 동의 안 한 계정(consentedAt 없음)에서만, 그리고 request.time과
 * 정확히 같은 값으로만 쓸 수 있게 막아서 — 한 번 기록되면 다시 못 바꾼다. */
export async function recordConsent(uid: string): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'users', uid), { consentedAt: serverTimestamp() });
}

export async function bumpDayCount(uid: string, delta: number): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'users', uid), { dayCount: increment(delta) });
}

/** 이 기기의 Expo 푸시 토큰을 내 계정에 등록한다(여러 기기를 쓰면 배열에
 * 여러 개가 쌓인다). 이미 등록된 토큰이면 중복 없이 그대로 둔다. */
export async function addPushToken(uid: string, token: string): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'users', uid), { pushTokens: arrayUnion(token) });
}

/** 로그아웃할 때 이 기기의 푸시 토큰을 계정에서 뗀다. 안 떼면, 같은 기기를
 * 여러 계정이 돌려쓸 때(가족 공용 기기, 테스트 계정 전환 등) 로그아웃한
 * 계정 앞으로 온 알림이 그 기기에 로그인된 다른 계정 화면에 푸시로 뜨는
 * 사고가 난다 — Expo 푸시 토큰은 계정이 아니라 "이 기기의 이 앱 설치"에
 * 묶이는 값이라, 계정을 바꿔도 토큰 자체는 그대로 남기 때문이다. */
export async function removePushToken(uid: string, token: string): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'users', uid), { pushTokens: arrayRemove(token) });
}

export async function updateNotificationSettings(uid: string, settings: NotificationSettings): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'users', uid), { notificationSettings: settings });
}

/** 지금 이 기기에서 실제로 쓰고 있는 언어를 계정에 기록한다(_layout.tsx가
 * 언어가 바뀔 때마다 부른다). 서버가 푸시 알림 문구를 무슨 언어로 보낼지
 * 판단하는 유일한 근거라, "기기 설정을 따름"이었어도 여기엔 그걸 풀어낸
 * 실제 값('ko'|'en')만 저장한다. */
export async function updateUserLocale(uid: string, locale: 'ko' | 'en'): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'users', uid), { locale });
}

const FIND_UID_BY_EMAIL_URL = 'https://asia-northeast3-day-app-6e618.cloudfunctions.net/findUidByEmail';
const EXCHANGE_KAKAO_CODE_URL = 'https://asia-northeast3-day-app-6e618.cloudfunctions.net/exchangeKakaoCode';

/**
 * 카카오 로그인의 인가 코드를 Firebase 커스텀 토큰으로 바꾼다. 로그인하기
 * *전*에 호출하는 함수라(아직 Firebase 로그인 전이니 이 요청엔 실어보낼
 * ID 토큰이 없다) 인증 없이 호출한다 — 대신 Cloud Function 쪽에서 IP 기준
 * 요청 빈도를 제한한다.
 */
export async function exchangeKakaoCode(
  code: string,
  redirectUri: string
): Promise<{ customToken: string; nickname: string; photoURL: string | null }> {
  const res = await fetch(EXCHANGE_KAKAO_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri }),
  });
  if (res.status === 429) throw new Error(t('users.tooManyRequests'));
  if (!res.ok) throw new Error(t('users.kakaoLoginFailed'));
  return res.json();
}

/**
 * 이메일로 uid를 조회한다. usersByEmail 컬렉션은 더 이상 클라이언트가 직접
 * 읽지 못한다(로그인만 하면 임의 이메일을 무제한으로 훑어볼 수 있는 계정
 * 열거 문제가 있었다) — 대신 요청 빈도를 제한하는 findUidByEmail Cloud
 * Function을 거친다.
 */
export async function findUidByEmail(email: string): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) throw new Error(t('users.loginRequired'));
  const token = await user.getIdToken();
  const res = await fetch(`${FIND_UID_BY_EMAIL_URL}?email=${encodeURIComponent(emailKey(email))}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (res.status === 429) throw new Error(t('users.tooManyRequests'));
  if (!res.ok) throw new Error(t('users.emailLookupFailed'));
  const data = (await res.json()) as { uid: string };
  return data.uid;
}

export async function listFriendGroups(uid: string): Promise<FriendGroup[]> {
  const database = requireDb();
  const q = query(collection(database, 'users', uid, 'groups'));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<FriendGroup, 'id'>) }))
    .sort((a, b) => a.order - b.order);
}

export async function createFriendGroup(uid: string, name: string): Promise<FriendGroup> {
  const database = requireDb();
  const groups = await listFriendGroups(uid);
  const groupRef = doc(collection(database, 'users', uid, 'groups'));
  const data = { name: name.trim(), order: groups.length, createdAt: serverTimestamp() };
  await setDoc(groupRef, data);
  return { id: groupRef.id, ...data } as FriendGroup;
}

/** 그룹 이름을 바꾼다. 이 그룹을 참조하는 각 친구의 friends 문서에도
 * groupName이 복사돼 있어서(비정규화), 함께 갱신해야 그 친구 목록 화면에
 * 예전 이름이 남아있지 않는다. */
export async function renameFriendGroup(uid: string, groupId: string, name: string): Promise<void> {
  const database = requireDb();
  const trimmed = name.trim();
  const membersSnap = await getDocs(
    query(collection(database, 'users', uid, 'friends'), where('groupId', '==', groupId))
  );
  const batch = writeBatch(database);
  batch.update(doc(database, 'users', uid, 'groups', groupId), { name: trimmed });
  for (const memberDoc of membersSnap.docs) {
    batch.update(memberDoc.ref, { groupName: trimmed });
  }
  await batch.commit();
}

export class GroupNotEmptyError extends Error {}

export async function deleteFriendGroup(uid: string, groupId: string): Promise<void> {
  const database = requireDb();
  const membersSnap = await getDocs(
    query(collection(database, 'users', uid, 'friends'), where('groupId', '==', groupId))
  );
  if (!membersSnap.empty) {
    throw new GroupNotEmptyError(t('friends.groupNotEmpty'));
  }
  await deleteDoc(doc(database, 'users', uid, 'groups', groupId));
}

export async function uploadAvatar(uid: string, localUri: string): Promise<string> {
  if (!storage) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  const response = await fetch(localUri);
  const blob = await response.blob();
  const avatarRef = ref(storage, `avatars/${uid}/avatar.jpg`);
  await uploadBytes(avatarRef, blob);
  return getDownloadURL(avatarRef);
}

/**
 * 계정 탈퇴 직전에 호출한다. Auth 계정만 지우면(deleteUser) 로그인만 막힐 뿐,
 * Firestore의 프로필 문서·이메일 매핑·아바타 파일은 그대로 남아서 "탈퇴해도
 * 다른 사람들 눈엔 프로필이 계속 보이는" 문제가 있었다. 작성했던 DAY들까지
 * 전부 지우진 않지만(그건 별도의 소프트 삭제 대상이고, 삭제하면 좋아요/댓글
 * 수 등 다른 사람과 얽힌 데이터 정합성이 깨진다), 적어도 개인 식별 정보는
 * 지운다 — 프로필이 화면마다 실시간 조회되는 구조라(withFreshProfiles 등)
 * 이렇게 바꿔두면 그 사람이 과거에 쓴 DAY/댓글에도 자동으로 "탈퇴한
 * 사용자"로 반영된다.
 *
 * Auth 계정을 지우기 *전에* 호출해야 한다 — 지운 뒤엔 request.auth가 없어져서
 * 이 정리 작업 자체가 권한 오류로 실패한다.
 */
export async function prepareAccountDeletion(uid: string, email: string | null): Promise<void> {
  const database = requireDb();
  await updateDoc(doc(database, 'users', uid), {
    nickname: '탈퇴한 사용자',
    bio: '',
    photoURL: null,
  });

  if (email) {
    await deleteDoc(doc(database, 'usersByEmail', emailKey(email))).catch(() => undefined);
  }

  if (storage) {
    await deleteObject(ref(storage, `avatars/${uid}/avatar.jpg`)).catch(() => undefined);
  }
}
