/**
 * DAY 앱의 색상 토큰. 따뜻한 크림톤 배경 + 테라코타 포인트 컬러로
 * 흔한 피드형 SNS와 구분되는, 편안하고 사적인 다이어리 톤을 만든다.
 */
export const Colors = {
  light: {
    background: '#FBF6EF',
    surface: '#FFFFFF',
    card: '#EFE4D3',
    ink: '#2B2420',
    sub: '#7A6F63',
    muted: '#A79A8A',
    line: '#E6DCCC',
    accent: '#C06B3F',
    accentInk: '#8A4A29',
    accentSoft: '#F3E1D1',
    onAccent: '#FFFFFF',
    danger: '#B3452F',
    // 펫 편지 화면 전용 포인트(목업의 초록) — 펫을 보내고 부르는 행동에만 쓴다.
    leaf: '#5B7F52',
    leafSoft: '#E3EDDA',
    onLeaf: '#FFFFFF',
    // 받은 편지 말풍선의 종이색
    paper: '#F5E9CF',
    paperInk: '#4A3826',
  },
  dark: {
    background: '#1C1814',
    surface: '#252019',
    card: '#332B22',
    ink: '#F3ECE2',
    sub: '#C2B7A8',
    muted: '#8C8072',
    line: '#3C332A',
    accent: '#E08B5D',
    accentInk: '#F6D8C2',
    accentSoft: '#40301F',
    onAccent: '#241708',
    danger: '#E08170',
    leaf: '#93B886',
    leafSoft: '#2B3826',
    onLeaf: '#14200F',
    // 다크 모드의 내 말풍선(accentSoft)과 확실히 구분되게 조금 더 밝고 노란 종이색.
    paper: '#4D402C',
    paperInk: '#F3E8CF',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** 앱 UI(탭바, 버튼, 입력창 등) 전체에 쓰는 고정 글씨체. DAY별 글씨체
 * 선택(FONT_PRESETS)과는 별개다 — UI 크롬은 항상 이 폰트로 통일한다. */
export const FontFamily = {
  serif: 'GowunBatang_400Regular',
  serifBold: 'GowunBatang_700Bold',
  sans: 'GowunDodum_400Regular',
};

/**
 * DAY 하나를 쓸 때 고를 수 있는 글씨체 프리셋. 앱 UI 전체가 아니라, 그
 * DAY의 제목·본문에만 적용된다(일기장에서 개인 필체를 고르는 느낌).
 * serif/serifBold는 제목처럼 감성적인 무게가 필요한 곳에, sans는 본문에
 * 쓴다. 굵기가 하나뿐인 폰트는 serif/serifBold/sans 전부 같은 값을 쓴다.
 */
export const FONT_PRESETS = {
  gowun: {
    label: '고운',
    serif: 'GowunBatang_400Regular',
    serifBold: 'GowunBatang_700Bold',
    sans: 'GowunDodum_400Regular',
  },
  nanum: {
    label: '나눔',
    serif: 'NanumMyeongjo_400Regular',
    serifBold: 'NanumMyeongjo_700Bold',
    sans: 'NanumGothic_400Regular',
  },
  jua: {
    label: '주아',
    serif: 'Jua_400Regular',
    serifBold: 'Jua_400Regular',
    sans: 'Jua_400Regular',
  },
  doHyeon: {
    label: '도현',
    serif: 'DoHyeon_400Regular',
    serifBold: 'DoHyeon_400Regular',
    sans: 'DoHyeon_400Regular',
  },
  blackHanSans: {
    label: '검은고딕',
    serif: 'BlackHanSans_400Regular',
    serifBold: 'BlackHanSans_400Regular',
    sans: 'BlackHanSans_400Regular',
  },
  gaegu: {
    label: '개구쟁이',
    serif: 'Gaegu_700Bold',
    serifBold: 'Gaegu_700Bold',
    sans: 'Gaegu_400Regular',
  },
  hiMelody: {
    label: '하이멜로디',
    serif: 'HiMelody_400Regular',
    serifBold: 'HiMelody_400Regular',
    sans: 'HiMelody_400Regular',
  },
  poorStory: {
    label: '푸어스토리',
    serif: 'PoorStory_400Regular',
    serifBold: 'PoorStory_400Regular',
    sans: 'PoorStory_400Regular',
  },
  nanumPen: {
    label: '나눔손글씨 펜',
    serif: 'NanumPenScript_400Regular',
    serifBold: 'NanumPenScript_400Regular',
    sans: 'NanumPenScript_400Regular',
  },
  nanumBrush: {
    label: '나눔손글씨 붓',
    serif: 'NanumBrushScript_400Regular',
    serifBold: 'NanumBrushScript_400Regular',
    sans: 'NanumBrushScript_400Regular',
  },
  eastSeaDokdo: {
    label: '동해독도',
    serif: 'EastSeaDokdo_400Regular',
    serifBold: 'EastSeaDokdo_400Regular',
    sans: 'EastSeaDokdo_400Regular',
  },
  songMyung: {
    label: '송명',
    serif: 'SongMyung_400Regular',
    serifBold: 'SongMyung_400Regular',
    sans: 'SongMyung_400Regular',
  },
} as const;

export type FontPresetKey = keyof typeof FONT_PRESETS;
export const DEFAULT_FONT_PRESET: FontPresetKey = 'gowun';

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 10,
  medium: 14,
  large: 18,
  pill: 999,
} as const;
