import { t } from '@/i18n/store';

/**
 * 표준적인 비밀번호 규칙: 8자 이상 + 영문/숫자/특수문자 중 2종류 이상 조합.
 * 국내 서비스에서 흔히 쓰는 최소 기준이다. Firebase Auth 자체 최소 길이(6자)
 * 보다 엄격해서, 이 검증을 통과하면 Firebase 쪽 제약은 항상 만족한다.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return t('password.tooShort');
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const categoryCount = [hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
  if (categoryCount < 2) {
    return t('password.needsVariety');
  }
  return null;
}
