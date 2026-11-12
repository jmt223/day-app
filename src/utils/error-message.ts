import { t } from '@/i18n/store';

/**
 * 화면에 보여줄 오류 문구. Firebase가 주는 원문(보안 규칙 평가 로그 같은 개발자용
 * 메시지)을 그대로 보여주면 사용자에겐 의미 없는 영어·코드 덩어리라서, 흔한 경우만
 * 사람 말로 바꾸고 나머지는 "잠시 후 다시"로 통일한다. 원문은 호출하는 쪽에서
 * console.error로 남긴다.
 */
export function friendlyErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  const message = String((error as { message?: string } | null)?.message ?? '');
  if (code === 'unavailable' || code === 'deadline-exceeded' || /network|offline|failed to fetch/i.test(message)) {
    return t('common.errorNetwork');
  }
  if (code === 'permission-denied') return t('common.errorPermission');
  return t('common.errorRetry');
}
