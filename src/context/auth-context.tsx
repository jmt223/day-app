import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as firebaseUpdateProfile,
  type User as FirebaseUser,
} from '@firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { ensureUserProfile, exchangeKakaoCode, getUserProfile, updateUserProfile, uploadAvatar } from '@/data/users';
import { unregisterPushNotifications } from '@/utils/push-notifications';
import type { UserProfile } from '@/types/user';

type AuthContextValue = {
  configured: boolean;
  initializing: boolean;
  user: FirebaseUser | null;
  profile: UserProfile | null;
  /** user.emailVerified는 User 객체가 그대로라 값이 바뀌어도 리렌더를
   * 유발 못 한다 — 그래서 별도 state로 따로 들고 있는다. */
  emailVerified: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, nickname: string, photoLocalUri?: string) => Promise<void>;
  /** 구글 로그인. AuthSession으로 받은 id_token을 그대로 넘긴다 — Firebase가
   * 구글 쪽 이메일 인증 여부를 그대로 이어받아서, 이메일 인증 화면을 다시
   * 거칠 필요가 없다. */
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  /** 카카오 로그인. Firebase엔 카카오가 기본 제공자로 없어서, 인가 코드를
   * Cloud Function(exchangeKakaoCode)에 보내 커스텀 토큰으로 교환한 뒤
   * signInWithCustomToken으로 로그인한다. */
  signInWithKakaoCode: (code: string, redirectUri: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfileFields: (patch: Partial<Pick<UserProfile, 'nickname' | 'bio' | 'photoURL'>>) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  /** 이메일 인증 상태를 서버에서 다시 확인한다(인증 링크를 클릭한 뒤
   * user.emailVerified가 바로 갱신되지 않아서, 명시적으로 새로고침해야
   * 반영된다). */
  refreshEmailVerified: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * "이메일 인증 필요" 화면을 띄울지 판단한다. 이메일/비밀번호 계정은 진짜
 * Firebase의 emailVerified 값을 그대로 따른다. 그런데 카카오 로그인은
 * Firebase 표준 제공자가 아니라 커스텀 토큰으로 로그인하는데, 그 안에
 * email_verified 클레임을 심어둬도(보안 규칙에서 쓰려고) 그건 ID 토큰
 * 클레임일 뿐이라 User.emailVerified(Auth 사용자 레코드 자체의 필드,
 * signInWithCustomToken 후 서버에서 다시 조회해오는 값)에는 반영되지
 * 않는다. 그 결과 카카오로 로그인한 사람은 이메일 자체가 없는데도 이
 * 화면에 영원히 갇히게 된다. 그래서 "애초에 이메일이 없는 계정"은
 * 검증할 이메일 자체가 없는 거니 통과시킨다.
 */
function isEffectivelyVerified(user: FirebaseUser | null): boolean {
  if (!user) return false;
  return user.emailVerified || !user.email;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [initializing, setInitializing] = useState(isFirebaseConfigured);

  // signUp()/소셜 로그인 함수들이 정확한 닉네임·사진으로 ensureUserProfile을
  // 직접 호출하는 동안에는, 이 리스너가 같은 계정에 대해 (닉네임 없이) 또
  // ensureUserProfile을 호출하지 않도록 막는다. 두 호출이 경합하면 어느 쪽
  // Firestore 쓰기가 먼저 커밋되느냐에 따라 이메일 접두사로 대체된 닉네임이
  // 사용자가 입력한 닉네임을 덮어쓸 수 있기 때문이다.
  //
  // 예전엔 이걸 uid로 비교했는데(로그인 함수가 반환한 credential.user.uid를
  // 가드에 채워넣는 방식), 그게 실제로는 경쟁을 못 막았다 —
  // createUserWithEmailAndPassword/signInWithCredential이 내부적으로
  // "로그인됨" 상태를 반영하면서 onAuthStateChanged 리스너를 깨우는 시점이,
  // 그 호출의 Promise가 실제로 resolve돼서 signUp() 쪽 코드가 다음 줄(가드에
  // uid를 채우는 줄)로 넘어가는 시점보다 더 빠를 수 있었다. 즉 가드를 채우기도
  // 전에 리스너가 먼저 깨어나 버려서, 하필 이메일/비밀번호 회원가입에서만
  // (구글/카카오는 뒤에서 무조건 한 번 더 덮어써서 자체 치유됨) 사용자가 고른
  // 닉네임·사진이 무시되고 이메일 접두사 닉네임으로 저장되는 사고가 났다.
  // 지금은 미래의 uid를 몰라도 되게, 로그인 SDK 호출 "직전"에 켤 수 있는
  // 단순 boolean으로 바꿔서 그 틈을 없앴다.
  const suppressListenerProfileSync = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setEmailVerified(isEffectivelyVerified(firebaseUser));
      if (firebaseUser) {
        // 이메일 인증을 마친 뒤에도, 그 전에 발급받아 브라우저에 저장돼 있던
        // ID 토큰은 새로고침만으로는 안 바뀐다(자연 만료 전까지 그대로
        // 재사용됨) — refreshEmailVerified()로 명시적으로 "인증 확인하기"를
        // 눌러야만 새 토큰을 받아오는데, 이미 화면상 인증된 걸로 보이면 그
        // 버튼을 다시 누를 일이 없다. 그래서 앱을 열 때마다(로그인 상태를
        // 감지할 때마다) 한 번씩 조용히 토큰을 새로 받아와서, 예전에 이미
        // 이 문제를 겪은 세션도 재로그인 없이 자동으로 복구되게 한다.
        if (firebaseUser.emailVerified) {
          firebaseUser.getIdToken(true).catch(() => undefined);
        }
        if (suppressListenerProfileSync.current) {
          setInitializing(false);
          return;
        }
        try {
          const p = await ensureUserProfile(firebaseUser);
          setProfile(p);
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setInitializing(false);
    });

    return unsubscribe;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await getUserProfile(user.uid);
    setProfile(p);
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase가 아직 설정되지 않았습니다.');
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, nickname: string, photoLocalUri?: string) => {
    if (!auth) throw new Error('Firebase가 아직 설정되지 않았습니다.');
    // 반드시 createUserWithEmailAndPassword를 부르기 "전에" 켠다 — 위
    // suppressListenerProfileSync 선언부 주석 참고.
    suppressListenerProfileSync.current = true;
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // updateProfile()은 전달한 User 객체 자체를 갱신하므로, 그 다음
      // ensureUserProfile이 user.photoURL을 읽을 때 방금 올린 사진 URL이
      // 그대로 반영된다(프로필 문서를 두 번 쓸 필요가 없다). 사진은 권장일 뿐
      // 필수가 아니라서 안 골랐으면 건너뛴다(프로필엔 기본 아이콘이 뜬다).
      const photoURL = photoLocalUri ? await uploadAvatar(credential.user.uid, photoLocalUri) : null;
      await firebaseUpdateProfile(credential.user, { displayName: nickname.trim(), photoURL });
      const p = await ensureUserProfile(credential.user, nickname);
      setProfile(p);
      await sendEmailVerification(credential.user).catch(() => undefined);
    } finally {
      suppressListenerProfileSync.current = false;
    }
  }, []);

  // 구글은 Firebase 표준 제공자라 onAuthStateChanged 리스너가 그대로
  // 구글이 이미 displayName/photoURL/email을 Firebase User에 채워주니
  // ensureUserProfile만으로도 첫 로그인은 문제없이 처리된다. 다만 이미
  // Firestore 문서가 있는 경우(예: 예전에 탈퇴했다가 같은 구글 계정으로
  // 다시 로그인, 또는 그냥 구글 프로필 이름/사진을 바꾼 경우)엔
  // ensureUserProfile이 옛날 값을 그대로 돌려주므로, 카카오 로그인과 같은
  // 이유로 항상 최신 값을 한 번 더 덮어쓴다.
  const signInWithGoogleIdToken = useCallback(async (idToken: string) => {
    if (!auth) throw new Error('Firebase가 아직 설정되지 않았습니다.');
    suppressListenerProfileSync.current = true;
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      const nickname = result.user.displayName?.trim() || undefined;
      const p = await ensureUserProfile(result.user, nickname);
      const patch: Partial<Pick<UserProfile, 'nickname' | 'photoURL'>> = { photoURL: result.user.photoURL };
      if (nickname) patch.nickname = nickname;
      await updateUserProfile(result.user.uid, patch);
      setProfile({ ...p, ...patch });
    } finally {
      suppressListenerProfileSync.current = false;
    }
  }, []);

  const signInWithKakaoCode = useCallback(async (code: string, redirectUri: string) => {
    if (!auth) throw new Error('Firebase가 아직 설정되지 않았습니다.');
    // 카카오는 Firebase 표준 제공자가 아니라(커스텀 토큰 로그인) displayName/
    // photoURL이 자동으로 안 채워진다 — signUp과 똑같은 이유로, 리스너가
    // 닉네임 없는 프로필을 먼저 만들어버리지 않게 막아둔다. exchangeKakaoCode/
    // signInWithCustomToken을 부르기 "전에" 켜야 한다(signUp 쪽 설명 참고).
    suppressListenerProfileSync.current = true;
    try {
      const { customToken, nickname, photoURL } = await exchangeKakaoCode(code, redirectUri);
      const credential = await signInWithCustomToken(auth, customToken);
      await firebaseUpdateProfile(credential.user, { displayName: nickname, photoURL });
      const p = await ensureUserProfile(credential.user, nickname);
      // 카카오 uid는 같은 카카오 계정이면 로그인할 때마다 항상 같다(kakao:
      // <카카오 사용자 ID>로 우리가 직접 고정해서 만든다). 그래서 예전에
      // 계정을 탈퇴했던 사람이 같은 카카오 계정으로 다시 로그인하면,
      // ensureUserProfile은 그때 익명화해둔("탈퇴한 사용자") 문서가 이미
      // 있으니 그걸 그대로 돌려준다 — 방금 카카오에서 받아온 진짜 닉네임/
      // 사진이 무시되는 셈이다. 카카오 로그인은 매번 그 시점의 최신
      // 프로필을 그대로 신뢰할 수 있는 정보라서, 기존 문서 여부와 상관없이
      // 항상 덮어써서 이 문제를 막는다.
      await updateUserProfile(credential.user.uid, { nickname, photoURL });
      setProfile({ ...p, nickname, photoURL });
    } finally {
      suppressListenerProfileSync.current = false;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    if (!auth) return;
    // 로그아웃 뒤엔 request.auth가 없어져서 이 계정 문서를 더 이상 못
    // 건드리니, 반드시 로그아웃 *전에* 이 기기의 푸시 토큰을 떼야 한다.
    if (auth.currentUser) {
      await unregisterPushNotifications(auth.currentUser.uid);
    }
    await firebaseSignOut(auth);
  }, []);

  const updateProfileFields = useCallback(
    async (patch: Partial<Pick<UserProfile, 'nickname' | 'bio' | 'photoURL'>>) => {
      if (!user) return;
      await updateUserProfile(user.uid, patch);
      await refreshProfile();
    },
    [user, refreshProfile]
  );

  const resetPassword = useCallback(async (email: string) => {
    if (!auth) throw new Error('Firebase가 아직 설정되지 않았습니다.');
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!user) return;
    await sendEmailVerification(user);
  }, [user]);

  const refreshEmailVerified = useCallback(async () => {
    if (!user) return;
    await reload(user);
    // reload()는 Auth 사용자 레코드(user.emailVerified)만 새로 가져온다 —
    // Firestore 보안 규칙이 보는 request.auth.token.email_verified는
    // "지금 들고 있는 ID 토큰"에 그 시점에 박혀 있는 값이라, 이메일을
    // 막 인증한 직후엔 여전히 예전 값(false)이다. 강제로 새 토큰을
    // 발급받지 않으면 화면은 "인증됨"으로 보이는데 서버는 계속
    // "인증 안 됨"으로 판단해서 DAY 작성/댓글 같은 isVerified() 요구
    // 요청이 이유 설명도 없이 거부되는 상태가 됐었다.
    await user.getIdToken(true);
    setEmailVerified(isEffectivelyVerified(user));
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isFirebaseConfigured,
      initializing,
      user,
      profile,
      emailVerified,
      signIn,
      signUp,
      signInWithGoogleIdToken,
      signInWithKakaoCode,
      signOutUser,
      refreshProfile,
      updateProfileFields,
      resetPassword,
      resendVerificationEmail,
      refreshEmailVerified,
    }),
    [
      initializing,
      user,
      profile,
      emailVerified,
      signIn,
      signUp,
      signInWithGoogleIdToken,
      signInWithKakaoCode,
      signOutUser,
      refreshProfile,
      updateProfileFields,
      resetPassword,
      resendVerificationEmail,
      refreshEmailVerified,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있어요.');
  return ctx;
}
