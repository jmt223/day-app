import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/hooks/use-locale';
import { notify } from '@/utils/confirm';

/** 로그인은 했지만 이메일 인증이 안 된 계정을 막는 화면. 새 DAY/댓글/친구
 * 요청은 보안 규칙에서도 이메일 인증을 요구하기 때문에(클라이언트만 막으면
 * 우회 가능해서), 여기서 UI로도 명확히 안내한다. */
export function EmailVerifyGate() {
  const { t } = useLocale();
  const { user, resendVerificationEmail, refreshEmailVerified, signOutUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleResend() {
    setSending(true);
    try {
      await resendVerificationEmail();
      notify(t('emailGate.resendSentTitle'), t('emailGate.resendSentMessage', { email: user?.email ?? '' }));
    } catch {
      notify(t('common.error'), t('emailGate.resendFailed'));
    } finally {
      setSending(false);
    }
  }

  async function handleCheck() {
    setChecking(true);
    try {
      await refreshEmailVerified();
    } catch {
      notify(t('common.error'), t('emailGate.checkFailed'));
    } finally {
      setChecking(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.container}>
          <ThemedText type="heading">{t('emailGate.title')}</ThemedText>
          <ThemedText type="body" color="sub" style={styles.body}>
            {t('emailGate.body', { email: user?.email ?? '' })}
          </ThemedText>

          <View style={styles.actions}>
            <PrimaryButton label={t('emailGate.check')} onPress={handleCheck} loading={checking} />
            <PrimaryButton label={t('emailGate.resend')} variant="outline" onPress={handleResend} loading={sending} />
            <PrimaryButton label={t('emailGate.signOut')} variant="outline" onPress={signOutUser} />
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.three,
  },
  body: {
    marginBottom: Spacing.three,
  },
  actions: {
    gap: Spacing.two,
  },
});
