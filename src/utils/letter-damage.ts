import { t } from '@/i18n/store';
import type { DamageLevel } from '@/types/letter';

export type MaskedLetterBody = { text: string; note: string | null };

/** 손상 등급만 보고 실제로 얼마나 가릴지 매번 계산한다 — 등급(enum)만
 * 저장해두면, 나중에 "몇 %를 가릴지"를 튜닝할 때 이 함수만 고치면 되고
 * 이미 저장된 편지 데이터를 다시 마이그레이션할 필요가 없다. */
export function maskLetterBody(body: string, level: DamageLevel): MaskedLetterBody {
  switch (level) {
    case 'corner': {
      const cut = Math.ceil(body.length * 0.8);
      return { text: body.slice(0, cut), note: t('letters.damage.cornerNote') };
    }
    case 'half': {
      const cut = Math.ceil(body.length * 0.5);
      return { text: body.slice(0, cut), note: t('letters.damage.halfNote') };
    }
    case 'total':
      return { text: '', note: t('letters.damage.totalNote') };
    case 'none':
    default:
      return { text: body, note: null };
  }
}
