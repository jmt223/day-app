import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { t } from '@/i18n/store';
import type { MoodKey } from '@/types/day';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// 예전엔 긍정적인 감정 5개뿐이었다 — 좋았던 날만 기록할 수 있고 힘들었던
// 날은 남길 방법이 없어서, 감정 흐름(mood-flow-summary)도 항상 좋은
// 쪽으로만 왜곡돼 보이는 문제가 있었다. 부정적인 감정도 똑같이 남길 수
// 있어야 실제 하루하루를 있는 그대로 기록하는 앱이 된다.
const MOOD_KEYS: { key: MoodKey; icon: IoniconName }[] = [
  { key: 'happy', icon: 'happy-outline' },
  { key: 'grateful', icon: 'flower-outline' },
  { key: 'excited', icon: 'sparkles-outline' },
  { key: 'calm', icon: 'leaf-outline' },
  { key: 'proud', icon: 'ribbon-outline' },
  { key: 'longing', icon: 'rainy-outline' },
  { key: 'sad', icon: 'sad-outline' },
  { key: 'angry', icon: 'flame-outline' },
  { key: 'anxious', icon: 'pulse-outline' },
  { key: 'tired', icon: 'moon-outline' },
];

/** 현재 언어로 번역된 라벨을 매번 새로 채워서 돌려준다 — 언어가 바뀌면 이걸
 * 렌더 중에 다시 호출하는 컴포넌트가 자동으로 최신 라벨을 보여준다. */
export function moodOptions(): { key: MoodKey; label: string; icon: IoniconName }[] {
  return MOOD_KEYS.map((m) => ({ ...m, label: t(`mood.${m.key}` as const) }));
}

export function moodLabel(key: MoodKey | null | undefined): string | null {
  if (!key) return null;
  return t(`mood.${key}` as const);
}

export function moodIcon(key: MoodKey | null | undefined) {
  return MOOD_KEYS.find((m) => m.key === key)?.icon ?? 'happy-outline';
}
