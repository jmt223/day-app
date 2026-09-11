import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme as useRNColorScheme } from 'react-native';

import { Colors, type ThemeColor } from '@/constants/theme';

export type ThemeSetting = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'day-app:theme-setting';

type ThemeContextValue = {
  themeSetting: ThemeSetting;
  scheme: ColorScheme;
  theme: Record<ThemeColor, string>;
  setThemeSetting: (next: ThemeSetting) => void;
};

const ThemeSettingContext = createContext<ThemeContextValue | null>(null);

/**
 * 언어 설정(LocaleProvider)과 똑같은 구조 — 기기 다크모드 설정을 그대로
 * 따르는 것 말고, 앱 안에서 직접 라이트/다크를 고정할 수 있게 한다. 예전엔
 * react-native의 useColorScheme()을 그냥 직접 썼는데(항상 기기 설정만
 * 따름), 언어처럼 사용자가 직접 고를 수 있어야 할 설정인데 그 선택지
 * 자체가 없었다.
 *
 * useTheme()의 반환값(Colors[scheme] 객체) 모양은 그대로 유지해서, 이미
 * 앱 전체에서 useTheme()을 쓰는 수많은 화면/컴포넌트를 하나도 안 건드리고
 * 이 기능을 추가할 수 있게 했다 — 내부 구현만 이 Provider를 보도록 바뀐다.
 */
export function ThemeSettingProvider({ children }: { children: ReactNode }) {
  const osScheme = useRNColorScheme();
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!active) return;
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setThemeSettingState(saved);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setThemeSetting = useCallback((next: ThemeSetting) => {
    setThemeSettingState(next);
    AsyncStorage.setItem(STORAGE_KEY, next)
      .catch(() => undefined)
      .finally(() => {
        // 언어 설정과 같은 이유(웹 정적 내보내기 환경에서 Context 변경이
        // 이미 떠 있는 다른 화면까지 안 이어지는 문제를 겪었다)로, 저장이
        // 끝나면 페이지를 새로 불러와서 테마가 앱 전체에 확실히 반영되게
        // 한다. 네이티브는 이미 진짜 React state라 즉시 반영되므로 그대로
        // 둔다.
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.reload();
        }
      });
  }, []);

  // 하이드레이션 전(웹 정적 렌더링 직후)에는 항상 'light'로 고정해서 서버와
  // 클라이언트 첫 렌더를 맞춘다 — 기존 use-color-scheme.web.ts와 같은 이유.
  const scheme: ColorScheme = !hydrated
    ? 'light'
    : themeSetting === 'system'
      ? osScheme === 'dark'
        ? 'dark'
        : 'light'
      : themeSetting;

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeSetting: hydrated ? themeSetting : 'system',
      scheme,
      theme: Colors[scheme],
      setThemeSetting,
    }),
    [themeSetting, scheme, hydrated, setThemeSetting]
  );

  return <ThemeSettingContext.Provider value={value}>{children}</ThemeSettingContext.Provider>;
}

export function useThemeSetting(): ThemeContextValue {
  const ctx = useContext(ThemeSettingContext);
  if (!ctx) throw new Error('useThemeSetting은 ThemeSettingProvider 내부에서만 사용할 수 있어요.');
  return ctx;
}
