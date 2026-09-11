import * as Google from 'expo-auth-session/providers/google';
import { useEffect, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/hooks/use-locale';
import { googleWebClientId } from '@/lib/env';
import { describeAuthError } from '@/utils/auth-errors';
import { notify } from '@/utils/confirm';

/**
 * 구글 로그인 버튼 하나에 필요한 걸 다 묶어둔 훅. 화면 쪽은 signIn()만
 * 호출하면 되고, id_token을 Firebase 자격증명으로 바꿔 로그인하는 부분은
 * auth-context의 signInWithGoogleIdToken이 담당한다.
 */
export function useGoogleSignIn() {
  const { t } = useLocale();
  const { signInWithGoogleIdToken } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: googleWebClientId,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'error') {
      notify(t('auth.social.loginFailedTitle'), t('auth.social.googleFailed'));
      return;
    }
    if (response.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setSigningIn(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    signInWithGoogleIdToken(idToken)
      .catch((error) => notify(t('auth.social.loginFailedTitle'), describeAuthError(error)))
      .finally(() => setSigningIn(false));
    // response 객체 identity가 바뀔 때만 반응하면 되고, signInWithGoogleIdToken/t는
    // 안정된 함수 참조라 deps에 넣을 필요가 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  async function signIn() {
    if (!googleWebClientId) {
      notify(t('auth.social.notConfiguredTitle'), t('auth.social.googleNotConfigured'));
      return;
    }
    await promptAsync();
  }

  return { signIn, signingIn, ready: !!request && !!googleWebClientId };
}
