import { t } from '@/i18n/store';

export function describeAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return t('authError.invalidEmail');
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return t('authError.wrongCredential');
    case 'auth/email-already-in-use':
      return t('authError.emailInUse');
    case 'auth/weak-password':
      return t('authError.weakPassword');
    case 'auth/network-request-failed':
      return t('authError.network');
    case 'auth/account-exists-with-different-credential':
      return t('authError.accountExistsDifferentCredential');
    default:
      return t('authError.default');
  }
}
