import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import { translations, type TranslationKey } from '@/i18n/translations';

export type Locale = 'ko' | 'en';
export type LocaleSetting = 'system' | Locale;

const STORAGE_KEY = 'day-app:locale-setting';

/**
 * 기기/브라우저 언어가 한국어인지 본다. 지원 언어가 한국어/영어 둘뿐이라,
 * 한국어가 아니면 전부 영어로 취급한다(중국어/일본어 등 제3의 언어 사용자도
 * 영어로 보게 되는데, 번역이 없는 언어에서 그나마 가장 널리 통하는
 * 선택이다).
 */
function detectDeviceLocale(): Locale {
  try {
    const code = Localization.getLocales()[0]?.languageCode;
    return code === 'ko' ? 'ko' : 'en';
  } catch {
    return 'ko';
  }
}

// 웹 정적 렌더링(서버)과 앱 최초 렌더는 저장된 설정이나 기기 언어를 아직 모르는
// 상태다. 항상 'ko'로 시작해서 하이드레이션 불일치를 피하고, initLocale()이
// 끝나면(거의 즉시, 다음 렌더에서) 실제 값으로 갱신된다 — 기존 코드가 전부
// 한국어였던 것과 동일한 "첫 화면"을 보장한다.
let localeSetting: LocaleSetting = 'system';
let resolvedLocale: Locale = 'ko';

const listeners = new Set<() => void>();
function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLocaleSetting(): LocaleSetting {
  return localeSetting;
}

export function getLocale(): Locale {
  return resolvedLocale;
}

function applyResolvedLocale() {
  resolvedLocale = localeSetting === 'system' ? detectDeviceLocale() : localeSetting;
}

/** 앱 시작 시 한 번 호출한다(이 모듈이 로드될 때 자동으로도 호출됨). 저장된
 * 설정을 읽어와 실제 언어를 확정하고, 구독 중인 컴포넌트를 다시 렌더한다. */
export async function initLocale(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === 'ko' || saved === 'en' || saved === 'system') {
      localeSetting = saved;
    }
  } catch {
    // 저장된 값을 못 읽으면 기본값(system)을 그대로 쓴다.
  }
  applyResolvedLocale();
  notifyListeners();
}

export async function setLocaleSetting(next: LocaleSetting): Promise<void> {
  // 저장을 먼저 끝내고 나서 상태를 바꾼다 — 반대 순서(먼저 바꾸고 나중에
  // 저장)였을 때, 고른 직후 바로 화면을 나가면(예: 뒤로가기) 저장이 끝나기
  // 전에 페이지가 넘어가면서 저장이 씹히는 경우가 있었다. 그러면 이 화면을
  // 다시 들어와도(=새로 로드해도) 저장 안 된 예전 값이 보이는 것처럼
  // 느껴졌다.
  try {
    await AsyncStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 저장에 실패해도 최소한 이번 세션 동안은 반영되게 계속 진행한다.
  }
  localeSetting = next;
  applyResolvedLocale();
  notifyListeners();
}

// 모듈이 로드되자마자 저장된 설정/기기 언어를 반영하기 시작한다. 웹 정적
// 렌더(Node, window/localStorage 없음)에서도 detectDeviceLocale과
// AsyncStorage.getItem 양쪽 다 내부적으로 실패를 흡수하므로 안전하다.
void initLocale();

/** 특정 언어로 고정해서 번역한다 — 하이드레이션 전(useLocale 참고)처럼
 * "지금 스토어가 뭐라고 하든 이 언어로만" 번역해야 하는 드문 경우에 쓴다.
 * 그 외에는 아래 t()를 쓴다. */
export function translateAs(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = translations[locale] ?? translations.ko;
  let text = dict[key] ?? translations.ko[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{{${name}}}`, String(value));
    }
  }
  return text;
}

/**
 * 컴포넌트 밖(유틸 함수, 이벤트 핸들러)에서도 쓸 수 있는 전역 번역 함수.
 * 컴포넌트 안에서는 언어가 바뀔 때 자동으로 다시 렌더되도록
 * `useLocale()`의 `t`를 대신 쓴다(내부적으로 이 함수를 그대로 호출한다).
 * 변수는 `{{name}}` 형태로 문자열에 넣고 두 번째 인자로 채운다.
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  return translateAs(resolvedLocale, key, vars);
}
