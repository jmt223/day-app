import { t } from '@/i18n/store';
import type { TextAlignKey } from '@/types/day';

const TEXT_ALIGN_KEYS: TextAlignKey[] = ['left', 'center', 'right'];

/** 현재 언어로 번역된 옵션 목록. 렌더마다 새로 호출해서 언어 변경에
 * 맞춰 갱신되게 한다. */
export function textAlignOptions(): { key: TextAlignKey; label: string }[] {
  return TEXT_ALIGN_KEYS.map((key) => ({ key, label: t(`textAlign.${key}`) }));
}
