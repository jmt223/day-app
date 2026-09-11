import { GowunBatang_400Regular, GowunBatang_700Bold } from '@expo-google-fonts/gowun-batang';
import { GowunDodum_400Regular } from '@expo-google-fonts/gowun-dodum';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, usePathname, type Theme } from 'expo-router';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform } from 'react-native';

import { ConsentGate } from '@/components/consent-gate';
import { EmailVerifyGate } from '@/components/email-verify-gate';
import { HeaderBackButton } from '@/components/header-back-button';
import { LoadingView } from '@/components/loading-view';
import { SetupNotice } from '@/components/setup-notice';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { Colors, FontFamily } from '@/constants/theme';
import { LocaleProvider } from '@/context/locale-context';
import { ThemeSettingProvider, useThemeSetting } from '@/context/theme-context';
import { updateUserLocale } from '@/data/users';
import { useLocale } from '@/hooks/use-locale';
import { registerForPushNotifications } from '@/utils/push-notifications';

SplashScreen.preventAutoHideAsync();
// 구글/카카오 로그인 팝업(웹) 또는 브라우저 탭(네이티브)이 인증을 마치고
// 앱으로 돌아올 때, 그 응답을 useAuthRequest의 response로 정확히 전달하기
// 위해 앱 시작 시 한 번 등록해둬야 한다(expo-auth-session 공식 가이드 권장 위치).
WebBrowser.maybeCompleteAuthSession();

function buildNavigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const colors = Colors[scheme];
  return {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.ink,
      border: colors.line,
      primary: colors.accent,
      notification: colors.accent,
    },
  };
}

export default function RootLayout() {
  // 앱 UI 전체(FontFamily)가 실제로 쓰는 폰트 3개만 여기서 블로킹으로
  // 로드한다. DAY 작성 시 고를 수 있는 글씨체 프리셋(FONT_PRESETS)과
  // 편지지 손글씨체는 여기 없다 — 로그인 화면 하나 보려고 그 12가지
  // 손글씨체까지 다 받을 이유가 없어서, 실제로 그 글씨체가 보이는
  // 화면에서만 받도록 뺐다(hooks/use-decorative-fonts.ts 참고).
  const [fontsLoaded] = useFonts({
    GowunBatang_400Regular,
    GowunBatang_700Bold,
    GowunDodum_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeSettingProvider>
        <LocaleProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </LocaleProvider>
      </ThemeSettingProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { scheme } = useThemeSetting();
  const { configured, initializing, user, emailVerified, profile } = useAuth();
  const { t, locale } = useLocale();
  const pathname = usePathname();

  // 웹에서 화면을 이동하면(카드를 눌러 DAY 상세로 들어가는 등), 방금 누른
  // 버튼(Pressable)에 여전히 포커스가 남아있는 채로 이전 화면 컨테이너가
  // 화면에서 사라지며 접근성 트리에서 aria-hidden 처리된다 — 포커스가
  // 남아있는 요소를 조상이 aria-hidden으로 숨기는 건 스크린 리더 사용자
  // 입장에서 잘못된 상태라 브라우저가 경고를 띄운다. 라우트가 바뀔 때마다
  // 지금 포커스된 요소를 놓아주면(다음 화면이 필요하면 스스로 원하는
  // 요소에 포커스를 다시 준다) 이 경고가 안 뜬다.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }, [pathname]);

  useEffect(() => {
    if (user && emailVerified) {
      registerForPushNotifications(user.uid);
    }
  }, [user, emailVerified]);

  // 이 기기에서 실제로 쓰고 있는 언어를 계정에도 기록해둔다 — 서버(푸시
  // 알림)는 기기에 저장된 "언어 설정"을 알 방법이 없어서, 실제 문구를
  // 무슨 언어로 보낼지 판단할 유일한 근거가 이 값이다. 이미 같은 값이면
  // 매번 다시 쓰지 않는다.
  useEffect(() => {
    if (user && profile && profile.locale !== locale) {
      updateUserLocale(user.uid, locale).catch(() => undefined);
    }
  }, [user, profile, locale]);

  // 앱이 백그라운드/종료 상태일 때 온 푸시를 사용자가 탭하면, 그냥 앱만
  // 열리고 끝나는 게 아니라 관련 화면으로 바로 이동시킨다(서버가 실어
  // 보낸 type/dayId는 functions/index.js의 sendPushOnNotification 참고).
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        dayId?: string | null;
        letterId?: string | null;
      };
      if (data?.type === 'friend_request') {
        router.push('/(tabs)/friends');
      } else if (data?.type === 'pet_summon') {
        router.push('/(tabs)/letters');
      } else if (data?.letterId) {
        router.push(`/letters/${data.letterId}`);
      } else if (data?.dayId) {
        router.push(`/day/${data.dayId}`);
      } else {
        router.push('/notifications');
      }
    });
    return () => subscription.remove();
  }, []);

  if (!configured) {
    return <SetupNotice />;
  }

  if (initializing) {
    return <LoadingView />;
  }

  if (user && !emailVerified) {
    return <EmailVerifyGate />;
  }

  // 이메일/구글/카카오 어느 방법으로 가입했든, 이용약관·개인정보처리방침에
  // 아직 동의하지 않은 계정(consentedAt 없음)은 다른 화면을 쓰기 전에 여기서
  // 막는다 — profile이 아직 없는 경우(로딩 실패 등 예외 상황)까지 여기서
  // 막아버리면 그 오류를 회복할 방법이 없어지니, profile이 실제로 있을
  // 때만 검사한다.
  if (user && emailVerified && profile && !profile.consentedAt) {
    return <ConsentGate />;
  }

  const colors = Colors[scheme];

  return (
    <ThemeProvider value={buildNavigationTheme(scheme)}>
      <Stack
        screenOptions={{
          headerShown: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: FontFamily.serifBold },
        }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" />
          {/* day/[id]는 제목을 그 DAY 제목으로 동적으로 바꿔야 해서
              화면 자신이 useLayoutEffect로 headerLeft까지 직접 설정한다
              (아래 day/[id].tsx 참고) — 여기서는 headerShown만 켠다. */}
          <Stack.Screen name="day/[id]" options={{ headerShown: true, title: t('header.day') }} />
          <Stack.Screen
            name="profile/index"
            options={{ headerShown: true, title: t('header.profile'), headerLeft: () => <HeaderBackButton fallbackHref="/(tabs)" /> }}
          />
          <Stack.Screen
            name="profile/edit"
            options={{ headerShown: true, title: t('header.profileEdit'), headerLeft: () => <HeaderBackButton fallbackHref="/profile" /> }}
          />
          <Stack.Screen
            name="profile/liked"
            options={{ headerShown: true, title: t('header.liked'), headerLeft: () => <HeaderBackButton fallbackHref="/profile" /> }}
          />
          <Stack.Screen
            name="profile/comments"
            options={{ headerShown: true, title: t('header.myComments'), headerLeft: () => <HeaderBackButton fallbackHref="/profile" /> }}
          />
          <Stack.Screen
            name="profile/blocked"
            options={{ headerShown: true, title: t('header.blocked'), headerLeft: () => <HeaderBackButton fallbackHref="/profile" /> }}
          />
          <Stack.Screen
            name="profile/notification-settings"
            options={{
              headerShown: true,
              title: t('header.notificationSettings'),
              headerLeft: () => <HeaderBackButton fallbackHref="/profile" />,
            }}
          />
          <Stack.Screen
            name="profile/language"
            options={{ headerShown: true, title: t('header.language'), headerLeft: () => <HeaderBackButton fallbackHref="/profile" /> }}
          />
          <Stack.Screen
            name="profile/theme"
            options={{ headerShown: true, title: t('header.theme'), headerLeft: () => <HeaderBackButton fallbackHref="/profile" /> }}
          />
          <Stack.Screen
            name="notifications"
            options={{ headerShown: true, title: t('header.notifications'), headerLeft: () => <HeaderBackButton fallbackHref="/(tabs)" /> }}
          />
          <Stack.Screen
            name="day-list"
            options={{ headerShown: true, headerLeft: () => <HeaderBackButton fallbackHref="/(tabs)" /> }}
          />
          <Stack.Screen
            name="pets"
            options={{ headerShown: true, title: t('header.pets'), headerLeft: () => <HeaderBackButton fallbackHref="/profile" /> }}
          />
          <Stack.Screen
            name="letters/compose"
            options={{
              headerShown: true,
              title: t('header.letterCompose'),
              headerLeft: () => <HeaderBackButton fallbackHref="/(tabs)/letters" />,
            }}
          />
          <Stack.Screen
            name="letters/[id]"
            options={{
              headerShown: true,
              title: t('header.letterDetail'),
              headerLeft: () => <HeaderBackButton fallbackHref="/(tabs)/letters" />,
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* 로그인 여부와 무관하게 항상 열람 가능해야 해서(스토어 심사, 구글/
            카카오 로그인 콘솔 검수, 가입 전 방문자) 어느 Stack.Protected에도
            넣지 않는다 — 감싸지 않은 화면은 guard와 무관하게 항상 라우팅된다. */}
        <Stack.Screen
          name="privacy-policy"
          options={{
            headerShown: true,
            title: t('header.privacyPolicy'),
            headerLeft: () => <HeaderBackButton fallbackHref={user ? '/(tabs)' : '/(auth)/login'} />,
          }}
        />
        <Stack.Screen
          name="terms"
          options={{
            headerShown: true,
            title: t('header.terms'),
            headerLeft: () => <HeaderBackButton fallbackHref={user ? '/(tabs)' : '/(auth)/login'} />,
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
