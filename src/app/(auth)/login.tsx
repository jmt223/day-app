import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { SocialSignInButtons } from '@/components/social-sign-in-buttons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/hooks/use-locale';
import { describeAuthError } from '@/utils/auth-errors';
import { notify } from '@/utils/confirm';

export default function LoginScreen() {
  const { t } = useLocale();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 로그인은 새 비밀번호 규칙을 강제할 필요가 없다 — 예전 규칙(6자 이상)으로
  // 만들어진 기존 계정도 로그인은 돼야 하니, 그냥 비어있지만 않으면 된다.
  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function handleSubmit() {
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (error) {
      notify(t('auth.login.failedTitle'), describeAuthError(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <ThemedText type="display" style={styles.logo}>
              DAY
            </ThemedText>
            <ThemedText type="body" color="sub" style={styles.tagline}>
              {t('auth.tagline')}
            </ThemedText>

            <ThemedView style={styles.form}>
              <FormField
                label={t('auth.email')}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                placeholder={t('auth.emailPlaceholder')}
              />
              <FormField
                label={t('auth.password')}
                secureTextEntry
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.password')}
              />
              <PrimaryButton label={t('auth.login.submit')} onPress={handleSubmit} loading={loading} disabled={!canSubmit} />
              <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
                <ThemedText type="caption" color="sub">
                  {t('auth.login.forgotPassword')}
                </ThemedText>
              </Link>
            </ThemedView>

            <SocialSignInButtons />

            <ThemedView style={styles.footer}>
              <ThemedText type="caption" color="sub">
                {t('auth.login.noAccount')}
              </ThemedText>
              <Link href="/(auth)/signup" replace>
                <ThemedText type="caption" color="accentInk" style={styles.link}>
                  {t('auth.login.signupLink')}
                </ThemedText>
              </Link>
            </ThemedView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.five,
  },
  logo: {
    textAlign: 'center',
    letterSpacing: 1,
  },
  tagline: {
    textAlign: 'center',
    marginTop: -Spacing.four,
  },
  form: {
    gap: Spacing.three,
  },
  forgotLink: {
    alignSelf: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  link: {
    fontWeight: '700',
  },
});
