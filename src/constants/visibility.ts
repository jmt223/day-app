import { t } from '@/i18n/store';
import type { DayVisibility } from '@/types/day';

const VISIBILITY_KEYS: DayVisibility[] = ['public', 'friends', 'group', 'private'];

/** 현재 언어로 번역된 옵션 목록. Segmented처럼 {key,label}[]을 받는
 * 컴포넌트에 매 렌더마다 새로 넘긴다(언어가 바뀌면 자동으로 갱신됨). */
export function visibilityOptions(): { key: DayVisibility; label: string }[] {
  return VISIBILITY_KEYS.map((key) => ({ key, label: t(`visibility.${key}`) }));
}

export function visibilityLabel(key: DayVisibility): string {
  return t(`visibility.${key}`);
}
