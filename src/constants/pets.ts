import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { t } from '@/i18n/store';
import type { DamageLevel } from '@/types/letter';
import type { PetPersonalityKey, PetSpeciesKey } from '@/types/pet';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** 가입 시 몇 마리까지 무료로 가질 수 있는지(가입 시 기본 1 + 미션 보상 1).
 * 이 앱엔 아직 결제/가상재화 시스템이 전혀 없어서(shop.tsx가 "coming
 * soon"), 원래 구상에 있던 "3번째부터 유료 뽑기"는 지금은 구현하지 않는다
 * — 나중에 결제 인프라가 생기면 이 값만 올리고 squirrel/turtle을 지급
 * 목록에 추가하면 된다. */
export const MAX_PETS = 2;

/** 두 번째 펫(미션 보상) 지급 기준 — "앱을 많이 쓰는지"를 가늠할 별도
 * 트래킹이 없어서, 이미 있는 dayCount를 그대로 재사용한다. 임의 기본값이라
 * 나중에 숫자만 바꾸면 된다. */
export const SECOND_PET_MISSION_DAY_COUNT = 7;

/** 손상 확률은 "종 기본값 + 성격 보정치"로 계산하고 [1,25]%로 클램프한다
 * (constants/pets.ts의 rollDamageLevel 참고). 전부 사용자와 합의된
 * "합리적 기본값, 나중에 조정" 전제 — 실제 서버 롤은
 * functions/index.js에서 이 표를 그대로 복사해 쓴다(클라이언트 번들과
 * 별도 배포되는 독립 코드라 import로 공유할 수 없다 — PUSH_MESSAGES와
 * 같은 이유). 여기 숫자를 바꾸면 functions/index.js도 같이 맞춰야 한다. */
const PET_SPECIES_LIST: {
  key: PetSpeciesKey;
  icon: IoniconName;
  baseDamagePercent: number;
  /** 이번 범위에서 실제로 지급 가능한지(squirrel/turtle은 유료 뽑기 전용
   * 자리만 예약, 아직 지급 경로 없음). */
  obtainable: boolean;
}[] = [
  // Ionicons엔 새/다람쥐/거북이를 그대로 나타내는 아이콘이 없어서, 종의
  // 특징을 은유하는 아이콘으로 대신한다(부엉이=야행성→달, 거북이=단단한
  // 등껍질→방패, 나머지는 발자국).
  { key: 'sparrow', icon: 'paw-outline', baseDamagePercent: 8, obtainable: true },
  { key: 'owl', icon: 'moon-outline', baseDamagePercent: 5, obtainable: true },
  { key: 'squirrel', icon: 'paw-outline', baseDamagePercent: 12, obtainable: false },
  { key: 'turtle', icon: 'shield-outline', baseDamagePercent: 3, obtainable: false },
];

const PET_PERSONALITY_LIST: { key: PetPersonalityKey; damageModifierPercent: number }[] = [
  { key: 'playful', damageModifierPercent: 4 },
  { key: 'timid', damageModifierPercent: 2 },
  { key: 'easygoing', damageModifierPercent: -2 },
  { key: 'careful', damageModifierPercent: -4 },
];

/** 손상이 "발생했을 때" 등급이 어떻게 나뉘는지(조건부 분포, 합계 100). */
const DAMAGE_LEVEL_DISTRIBUTION: { level: Exclude<DamageLevel, 'none'>; weight: number }[] = [
  { level: 'corner', weight: 60 },
  { level: 'half', weight: 30 },
  { level: 'total', weight: 10 },
];

export function petSpeciesOptions(): { key: PetSpeciesKey; label: string; icon: IoniconName; obtainable: boolean }[] {
  return PET_SPECIES_LIST.map((s) => ({ ...s, label: t(`pets.species.${s.key}` as const) }));
}

export function petSpeciesLabel(key: PetSpeciesKey): string {
  return t(`pets.species.${key}` as const);
}

export function petSpeciesIcon(key: PetSpeciesKey): IoniconName {
  return PET_SPECIES_LIST.find((s) => s.key === key)?.icon ?? 'paw-outline';
}

export function petPersonalityLabel(key: PetPersonalityKey): string {
  return t(`pets.personality.${key}` as const);
}

/** 무작위로 성격/성별을 배정한다 — 새 펫을 만들 때(grantStarterPet 등)
 * 클라이언트에서 호출한다. 손상 확률 자체는 서버가 계산하므로, 여기서
 * 뽑은 값이 클라이언트에 유리하게 편향돼도 실질적 이득이 없다(치팅
 * 방지는 functions/index.js가 담당). */
export function randomPersonality(): PetPersonalityKey {
  const keys = PET_PERSONALITY_LIST.map((p) => p.key);
  return keys[Math.floor(Math.random() * keys.length)];
}

export function randomSex(): 'male' | 'female' {
  return Math.random() < 0.5 ? 'male' : 'female';
}

/** 이 편지 구간(갈 때/올 때 각각)의 손상 확률(%, 0~100)을 계산한다.
 * functions/index.js에 있는 동일 로직과 반드시 숫자를 맞춰야 한다. */
export function damageProbabilityPercent(species: PetSpeciesKey, personality: PetPersonalityKey): number {
  const base = PET_SPECIES_LIST.find((s) => s.key === species)?.baseDamagePercent ?? 8;
  const modifier = PET_PERSONALITY_LIST.find((p) => p.key === personality)?.damageModifierPercent ?? 0;
  return Math.min(25, Math.max(1, base + modifier));
}

/** 손상 확률표를 굴려 등급을 하나 뽑는다(순수 함수라 서버/클라이언트
 * 어디서든 같은 로직을 쓸 수 있지만, 실제 저장은 항상 서버 쪽 롤만
 * 신뢰한다 — functions/index.js 참고). */
export function rollDamageLevel(species: PetSpeciesKey, personality: PetPersonalityKey): DamageLevel {
  const probability = damageProbabilityPercent(species, personality);
  if (Math.random() * 100 >= probability) return 'none';

  const totalWeight = DAMAGE_LEVEL_DISTRIBUTION.reduce((sum, d) => sum + d.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const d of DAMAGE_LEVEL_DISTRIBUTION) {
    if (roll < d.weight) return d.level;
    roll -= d.weight;
  }
  return 'corner';
}
