import { t } from '@/i18n/store';
import type { TranslationKey } from '@/i18n/translations';
import { petName } from '@/utils/josa';

const REACTIONS: Record<'pet' | 'snack', TranslationKey[]> = {
  pet: ['pets.reaction.pet1', 'pets.reaction.pet2', 'pets.reaction.pet3'],
  snack: ['pets.reaction.snack1', 'pets.reaction.snack2', 'pets.reaction.snack3'],
};

/** 쓰다듬기/간식 주기를 했을 때 펫의 반응 한 줄(꾸밈용, 무작위). 종 상관없이
 * 어울리는 문구만 쓴다(꼬리 없는 종도 있어서). */
export function randomPetReaction(kind: 'pet' | 'snack', name: string): string {
  const keys = REACTIONS[kind];
  const key = keys[Math.floor(Math.random() * keys.length)];
  return t(key, { pet: petName(name) });
}
