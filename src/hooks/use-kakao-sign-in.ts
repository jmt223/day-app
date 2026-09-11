import * as AuthSession from 'expo-auth-session';
import { useEffect, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/hooks/use-locale';
import { kakaoRestApiKey } from '@/lib/env';
import { notify } from '@/utils/confirm';

// authorizationEndpoint만 있으면 인가 코드(code)를 받아오는 데는 충분하다 —
// 코드를 액세스 토큰으로 바꾸는 건 서버(exchangeKakaoCode)가 대신 한다.
const discovery = { authorizationEndpoint: 'https://kauth.kakao.com/oauth/authorize' };

export function useKakaoSignIn() {
  const { t } = useLocale();
  const { signInWithKakaoCode } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const redirectUri = AuthSession.makeRedirectUri();

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: kakaoRestApiKey ?? '',
      redirectUri,
      scopes: ['profile_nickname', 'profile_image'],
      // 카카오는 PKCE를 요구하지 않고, 코드 교환도 서버에서 code_verifier 없이
      // 처리하니 꺼둔다 — 켜두면 서버 쪽에 verifier를 안 보내서 교환이 실패한다.
      usePKCE: false,
    },
    discovery
  );

  useEffect(() => {
    if (!response) return;
    if (response.type === 'error') {
      notify(t('auth.social.loginFailedTitle'), t('auth.social.kakaoFailed'));
      return;
    }
    if (response.type !== 'success') return;
    const code = response.params.code;
    if (!code) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setSigningIn(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    signInWithKakaoCode(code, redirectUri)
      .catch(() => notify(t('auth.social.loginFailedTitle'), t('auth.social.kakaoFailed')))
      .finally(() => setSigningIn(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  async function signIn() {
    if (!kakaoRestApiKey) {
      notify(t('auth.social.notConfiguredTitle'), t('auth.social.kakaoNotConfigured'));
      return;
    }
    await promptAsync();
  }

  return { signIn, signingIn, ready: !!request && !!kakaoRestApiKey };
}
