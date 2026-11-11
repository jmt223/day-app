import type { TextStyle } from 'react-native';

import { t } from '@/i18n/store';
import type { TranslationKey } from '@/i18n/translations';
import type { AnyPetSpeciesKey, PetPersonalityKey, PetSpeciesKey } from '@/types/pet';

/** 첫 펫 1 + 미션 보상 1. 3번째부터의 획득 방식(뽑기 등)과 최대 보유 수는
 * 아직 기획이 정해지지 않았다 — 정해지면 이 값과 firestore.rules의 petCount
 * 상한을 같이 올린다. */
export const MAX_PETS = 2;

/** 두 번째 펫 미션: DAY를 이만큼 쓰면 받는다(dayCount는 서버만 세는 값).
 * firestore.rules의 petCount 규칙(dayCount >= 7)과 숫자를 맞춰야 한다. */
export const SECOND_PET_MISSION_DAY_COUNT = 7;

/** 편지를 보낼 때 고르는 답장 대기시간(분). firestore.rules의
 * validWaitChoice와 같은 목록이어야 한다. */
export const WAIT_MINUTE_OPTIONS = [5, 15, 30, 60, 180, 360, 720, 1440] as const;
export type WaitMinutes = (typeof WAIT_MINUTE_OPTIONS)[number];
export const DEFAULT_WAIT_MINUTES: WaitMinutes = 60;

/**
 * 종마다 손상됐을 때 글자 위에 남는 흔적. 손상 확률은 종과 무관하고(기획서),
 * "어떻게 보이는지"만 다르다. 화면 크기와 상관없이 가려진 글자 자체에
 * 스타일을 입히는 방식이라 어느 기기에서 봐도 같은 글자에 같은 흔적이 남는다.
 */
export type DamageEffect = {
  labelKey: TranslationKey;
  span: TextStyle;
};

type SpeciesInfo = {
  key: PetSpeciesKey;
  emoji: string;
  /** 아바타 배경(라이트 모드). 다크 모드에선 투명도를 낮춰 쓴다. */
  tint: string;
  effect: DamageEffect;
};

export const PET_SPECIES: SpeciesInfo[] = [
  {
    key: 'dog',
    emoji: '🐶',
    tint: '#F3E2C7',
    effect: {
      labelKey: 'pets.damage.dog',
      span: {
        backgroundColor: 'rgba(122,166,204,0.32)',
        color: 'rgba(70,100,130,0.7)',
        textShadowColor: 'rgba(70,100,130,0.55)',
        textShadowRadius: 6,
      },
    },
  },
  {
    key: 'cat',
    emoji: '🐱',
    tint: '#F1E4D8',
    effect: {
      labelKey: 'pets.damage.cat',
      span: {
        backgroundColor: 'rgba(155,91,58,0.12)',
        color: 'rgba(120,80,60,0.85)',
        textDecorationLine: 'line-through',
        textDecorationColor: '#9B5B3A',
      },
    },
  },
  {
    key: 'bird',
    emoji: '🐦',
    tint: '#DDEBF3',
    effect: {
      labelKey: 'pets.damage.bird',
      span: {
        color: 'rgba(140,120,100,0.45)',
        textDecorationLine: 'underline',
        textDecorationStyle: 'dashed',
      },
    },
  },
  {
    key: 'horse',
    emoji: '🐴',
    tint: '#EADBCB',
    effect: {
      labelKey: 'pets.damage.horse',
      span: { backgroundColor: 'rgba(110,90,70,0.2)', color: 'rgba(90,70,50,0.8)', fontStyle: 'italic' },
    },
  },
  {
    key: 'cow',
    emoji: '🐮',
    tint: '#E9EEF0',
    effect: {
      labelKey: 'pets.damage.cow',
      span: {
        backgroundColor: 'rgba(120,150,110,0.28)',
        color: 'rgba(70,95,60,0.75)',
        fontStyle: 'italic',
        textShadowColor: 'rgba(70,95,60,0.45)',
        textShadowRadius: 4,
      },
    },
  },
  {
    key: 'pig',
    emoji: '🐷',
    tint: '#F8DCDF',
    effect: {
      labelKey: 'pets.damage.pig',
      span: { backgroundColor: 'rgba(122,84,48,0.45)', color: 'rgba(75,45,20,0.85)' },
    },
  },
  {
    key: 'rat',
    emoji: '🐭',
    tint: '#E6E3DE',
    effect: {
      labelKey: 'pets.damage.rat',
      span: {
        backgroundColor: 'rgba(0,0,0,0.05)',
        color: 'rgba(120,100,80,0.5)',
        textDecorationLine: 'underline',
        textDecorationStyle: 'dotted',
      },
    },
  },
  {
    key: 'tiger',
    emoji: '🐯',
    tint: '#F8E2C4',
    effect: {
      labelKey: 'pets.damage.tiger',
      span: {
        backgroundColor: 'rgba(230,140,40,0.16)',
        color: 'rgba(90,58,26,0.9)',
        fontWeight: '700',
        textDecorationLine: 'line-through',
        textDecorationColor: '#5A3A1A',
      },
    },
  },
  {
    key: 'rabbit',
    emoji: '🐰',
    tint: '#F6E6EC',
    effect: {
      labelKey: 'pets.damage.rabbit',
      span: {
        backgroundColor: 'rgba(240,170,190,0.18)',
        color: 'rgba(150,110,120,0.85)',
        textDecorationLine: 'underline',
        textDecorationStyle: 'dotted',
      },
    },
  },
  {
    key: 'dragon',
    emoji: '🐲',
    tint: '#DCEEDB',
    effect: {
      labelKey: 'pets.damage.dragon',
      span: { backgroundColor: 'rgba(45,25,15,0.68)', color: 'rgba(235,150,80,0.95)' },
    },
  },
  {
    key: 'snake',
    emoji: '🐍',
    tint: '#E3EFD9',
    effect: {
      labelKey: 'pets.damage.snake',
      span: {
        backgroundColor: 'rgba(120,160,90,0.24)',
        color: 'rgba(70,100,50,0.8)',
        textDecorationLine: 'underline',
        textDecorationStyle: 'dashed',
      },
    },
  },
  {
    key: 'sheep',
    emoji: '🐑',
    tint: '#F2F0EA',
    effect: {
      labelKey: 'pets.damage.sheep',
      span: {
        backgroundColor: 'rgba(255,255,255,0.78)',
        color: 'rgba(150,140,130,0.85)',
        textShadowColor: 'rgba(255,255,255,0.95)',
        textShadowRadius: 5,
      },
    },
  },
  {
    key: 'monkey',
    emoji: '🐵',
    tint: '#EEDFCF',
    effect: {
      labelKey: 'pets.damage.monkey',
      span: {
        backgroundColor: 'rgba(160,120,80,0.2)',
        fontStyle: 'italic',
        textDecorationLine: 'line-through',
        textDecorationStyle: 'dashed',
      },
    },
  },
  {
    key: 'chicken',
    emoji: '🐔',
    tint: '#FBEFD0',
    effect: {
      labelKey: 'pets.damage.chicken',
      span: {
        backgroundColor: 'rgba(230,180,60,0.22)',
        color: 'rgba(150,110,40,0.85)',
        textDecorationLine: 'underline',
        textDecorationStyle: 'dotted',
      },
    },
  },
];

/** 개편 전 4종 — 표시 모양만 가장 가까운 새 종을 빌려 쓴다. */
const LEGACY_SPECIES: Record<string, { emoji: string; like: PetSpeciesKey }> = {
  sparrow: { emoji: '🐦', like: 'bird' },
  owl: { emoji: '🦉', like: 'bird' },
  squirrel: { emoji: '🐿️', like: 'rat' },
  turtle: { emoji: '🐢', like: 'snake' },
};

export function speciesInfo(key: AnyPetSpeciesKey): SpeciesInfo {
  const direct = PET_SPECIES.find((s) => s.key === key);
  if (direct) return direct;
  const legacy = LEGACY_SPECIES[key];
  const base = PET_SPECIES.find((s) => s.key === legacy?.like) ?? PET_SPECIES[2];
  return { ...base, emoji: legacy?.emoji ?? base.emoji };
}

export function petSpeciesLabel(key: AnyPetSpeciesKey): string {
  return t(`pets.species.${key}` as TranslationKey);
}

const PET_PERSONALITIES: PetPersonalityKey[] = ['hasty', 'easygoing', 'careful', 'playful', 'timid', 'reliable'];

export function petPersonalityLabel(key: PetPersonalityKey): string {
  return t(`pets.personality.${key}` as TranslationKey);
}

export function petPersonalityDescription(key: PetPersonalityKey): string {
  return t(`pets.personalityDesc.${key}` as TranslationKey);
}

/** 성격은 기획서상 "부여 방식 미정"이라, 지금은 데려올 때 무작위로 정한다.
 * 확률 계산은 서버가 하니 여기서 뽑은 값이 편향돼도 이득이 없다. */
export function randomPersonality(): PetPersonalityKey {
  return PET_PERSONALITIES[Math.floor(Math.random() * PET_PERSONALITIES.length)];
}

export function randomSex(): 'male' | 'female' {
  return Math.random() < 0.5 ? 'male' : 'female';
}

/**
 * 화면 표시용 확률표 — functions/pet-config.js의 DEFAULT_PET_RULES와 같은 값.
 * 실제 추첨은 서버만 하고, 운영 중 config/petRules 문서로 바꾼 값은
 * data/pets.ts의 getPetRules가 읽어와 이 위에 덮어쓴다.
 */
export type PetRules = {
  personalities: Record<string, { baseDamagePercent?: number }>;
  intimacyDamageReductionPerPoint: number;
  minDamagePercent: number;
  intimacy: { max: number };
};

export const DEFAULT_PET_RULES: PetRules = {
  personalities: {
    hasty: { baseDamagePercent: 6 },
    easygoing: { baseDamagePercent: 5 },
    careful: { baseDamagePercent: 3 },
    playful: { baseDamagePercent: 8 },
    timid: { baseDamagePercent: 5 },
    reliable: { baseDamagePercent: 4 },
  },
  intimacyDamageReductionPerPoint: 0.04,
  minDamagePercent: 1,
  intimacy: { max: 100 },
};

/** 최종 손상 확률(%) = 성격 기본값 − 친밀도 × 0.04%p, 최소 1%. 소수 첫째 자리까지. */
export function damagePercentFor(personality: PetPersonalityKey, intimacy: number, rules: PetRules = DEFAULT_PET_RULES): number {
  const base = rules.personalities[personality]?.baseDamagePercent ?? 5;
  const value = Math.max(rules.minDamagePercent, base - intimacy * rules.intimacyDamageReductionPerPoint);
  return Math.round(value * 10) / 10;
}

/** 5분 / 1시간 / 24시간 같은 대기시간 표시. */
export function formatWaitMinutes(minutes: number): string {
  return minutes < 60 ? t('time.minutes', { n: minutes }) : t('time.hours', { n: Math.round(minutes / 60) });
}
