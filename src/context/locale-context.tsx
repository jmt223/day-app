import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import {
  getLocale,
  getLocaleSetting,
  initLocale,
  setLocaleSetting as persistLocaleSetting,
  translateAs,
  type Locale,
  type LocaleSetting,
} from '@/i18n/store';
import type { TranslationKey } from '@/i18n/translations';
import { notify } from '@/utils/confirm';

type LocaleContextValue = {
  locale: Locale;
  localeSetting: LocaleSetting;
  setLocaleSetting: (next: LocaleSetting) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * 언어 상태를 진짜 React state(useState)로 들고 있는 Provider. AuthProvider와
 * 똑같은 구조다 — 여기서 이전에 시도했던 "모듈 밖 변수 + 수동 구독"
 * 방식(useSyncExternalStore, 그다음 직접 만든 subscribe)은 둘 다 화면 안에서
 * 눌렀을 때 바로 반영이 안 되는 문제가 있었다. Context+useState는 React가
 * 리렌더를 직접 보장하는 가장 기본적인 방식이라 이 문제가 원천적으로 없다.
 *
 * i18n/store.ts의 모듈 상태는 계속 유지한다 — 컴포넌트가 아닌 곳(유틸
 * 함수, data/*.ts)에서 쓰는 전역 t()/getLocale()이 그걸 읽기 때문이다.
 * setLocaleSetting을 부를 때마다 이 Provider의 state와 store 양쪽을 같이
 * 갱신해서, 컴포넌트 안에서는 Context로 즉시 리렌더되고 컴포넌트 밖에서는
 * store를 통해 최신 값을 읽을 수 있게 한다.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  // 웹 정적 렌더링(서버)과 클라이언트 첫 렌더를 맞추기 위해 항상
  // 'system'으로 시작하고, 마운트 후(hydrated) 저장된 설정/기기 언어를 반영한다.
  const [localeSetting, setLocaleSettingState] = useState<LocaleSetting>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    initLocale().then(() => {
      if (!active) return;
      setLocaleSettingState(getLocaleSetting());
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const locale = hydrated ? getLocale() : 'ko';

  const setLocaleSetting = useCallback((next: LocaleSetting) => {
    // 로컬 state부터 바꿔서 이 값을 쓰는 모든 화면이 이 클릭 즉시(같은
    // 프레임에) 다시 렌더되게 한다 — 저장이 끝나길 기다리지 않는다.
    setLocaleSettingState(next);
    // store 쪽도 갱신해서 컴포넌트 밖 코드(t(), 유효성 검사 메시지 등)가
    // 곧바로 최신 언어를 쓰게 하고, 기기에 저장도 한다.
    void persistLocaleSetting(next).then(() => {
      // 웹 정적 내보내기 환경에서는 화면 이동(뒤로가기 포함)이 완전한 SPA
      // 클라이언트 라우팅으로 안 이어지는 경우가 있어서, Context가 바뀌어도
      // 다른 화면(상단바 등)이 실제로는 안 다시 그려지는 문제가 계속
      // 있었다 — 저장이 끝난 시점에 페이지를 새로 불러와서, 새로 시작하는
      // 앱이 방금 저장한 언어를 곧장 맞게 읽어오도록 확실히 만든다.
      // 언어 설정 화면 그 자리에서 조용히 새로고침(reload)하면 사용자
      // 입장에선 "화면이 왜 갑자기 깜빡이지" 싶을 수 있어서, 대신 왜
      // 그러는지 안내하고 홈 화면으로 자연스럽게 이동시킨다. 네이티브
      // 앱은 이런 페이지 전환/새로고침 개념이 없어서(계속 켜져있는 하나의
      // 자바스크립트 런타임) 이 문제 자체가 없고, Context 값만으로 이미
      // 바로 반영된다.
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const resolvedLocale = getLocale();
        notify(translateAs(resolvedLocale, 'language.appliedTitle'), translateAs(resolvedLocale, 'language.appliedMessage'));
        window.location.href = '/';
      }
    });
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translateAs(locale, key, vars),
    [locale]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, localeSetting: hydrated ? localeSetting : 'system', setLocaleSetting, t }),
    [locale, localeSetting, hydrated, setLocaleSetting, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale은 LocaleProvider 내부에서만 사용할 수 있어요.');
  return ctx;
}
