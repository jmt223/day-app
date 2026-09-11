import { t } from '@/i18n/store';

export type PhotoAspectKey = 'landscape' | 'portrait' | 'square';

/** DAY에 넣는 사진은 원본 비율 그대로가 아니라, 이 3가지 중 하나로 잘라
 * 넣는다. 글과 사진이 섞이는 일기장 레이아웃에서 사진마다 크기가 제각각이면
 * 지저분해 보이기 때문에, 모양은 고르되(가로/세로/정사각형) 실제 크기는
 * 항상 화면 너비 기준으로 통일해서 보여준다. */
const PHOTO_ASPECT_KEYS: { key: PhotoAspectKey; ratio: [number, number] }[] = [
  { key: 'landscape', ratio: [4, 3] },
  { key: 'portrait', ratio: [3, 4] },
  { key: 'square', ratio: [1, 1] },
];

/** 현재 언어로 번역된 옵션 목록. 렌더마다 새로 호출해서 언어 변경에 맞춰
 * 갱신되게 한다. */
export function photoAspectOptions(): { key: PhotoAspectKey; label: string; ratio: [number, number] }[] {
  return PHOTO_ASPECT_KEYS.map((opt) => ({ ...opt, label: t(`photoAspect.${opt.key}`) }));
}

const RATIO_VALUES: Record<PhotoAspectKey, number> = {
  landscape: 4 / 3,
  portrait: 3 / 4,
  square: 1,
};

/** 가로/세로 비율(너비 ÷ 높이) 값. 화면 너비가 정해지면 이 값으로 나눠서
 * 사진이 차지할 높이를 계산한다. */
export function photoAspectRatioValue(key: PhotoAspectKey): number {
  return RATIO_VALUES[key];
}
