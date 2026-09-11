import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useGoogleSignIn } from '@/hooks/use-google-sign-in';
import { useKakaoSignIn } from '@/hooks/use-kakao-sign-in';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';

/** 로그인/회원가입 화면 양쪽에서 똑같이 쓰는 소셜 로그인 버튼 묶음. 둘 다
 * 값(웹 클라이언트 ID / REST API 키)이 아직 설정 안 됐으면(.env 비어있음)
 * 버튼은 그대로 보이되 누르면 안내만 뜬다 — 설정 전에도 화면이 깨지지
 * 않게 하기 위해서다. */
export function SocialSignInButtons() {
  const theme = useTheme();
  const { t } = useLocale();
  const google = useGoogleSignIn();
  const kakao = useKakaoSignIn();

  return (
    <View style={styles.container}>
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: theme.line }]} />
        <ThemedText type="caption" color="muted">
          {t('auth.social.divider')}
        </ThemedText>
        <View style={[styles.dividerLine, { backgroundColor: theme.line }]} />
      </View>

      <Pressable
        onPress={google.signIn}
        disabled={google.signingIn}
        style={[styles.button, styles.googleButton, { borderColor: theme.line, backgroundColor: theme.surface }]}>
        {google.signingIn ? (
          <ActivityIndicator color={theme.ink} />
        ) : (
          <>
            <Ionicons name="logo-google" size={17} color="#4285F4" />
            <Text style={[styles.buttonText, { color: theme.ink }]}>{t('auth.social.google')}</Text>
          </>
        )}
      </Pressable>

      <Pressable onPress={kakao.signIn} disabled={kakao.signingIn} style={[styles.button, styles.kakaoButton]}>
        {kakao.signingIn ? (
          <ActivityIndicator color="#3C1E1E" />
        ) : (
          <>
            <Ionicons name="chatbubble" size={16} color="#3C1E1E" />
            <Text style={[styles.buttonText, styles.kakaoText]}>{t('auth.social.kakao')}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radius.large,
  },
  googleButton: {
    borderWidth: 1,
  },
  kakaoButton: {
    backgroundColor: '#FEE500',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  kakaoText: {
    color: '#3C1E1E',
  },
});
