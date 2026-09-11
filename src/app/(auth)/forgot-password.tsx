import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useLocale } from '@/hooks/use-locale';
import { describeAuthError } from '@/utils/auth-errors';
import { notify } from '@/utils/confirm';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await resetPassword(email);
      notify(t('auth.forgotPassword.sentTitle'), t('auth.forgotPassword.sentMessage'));
      // 새로고침/딥링크로 이 화면에 곧장 들어왔으면 이동 기록이 없어서
      // back()이 조용히 아무 일도 안 할 수 있다 — 그럴 땐 로그인 화면으로.
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(auth)/login');
      }
    } catch (error) {
      notify(t('auth.forgotPassword.failedTitle'), describeAuthError(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <ThemedView style={styles.header}>
              <ThemedView surface="accentSoft" style={styles.iconBadge}>
                <Ionicons name="key-outline" size={26} color={theme.accent} />
              </ThemedView>
              <ThemedText type="heading">{t('auth.forgotPassword.title')}</ThemedText>
              <ThemedText type="body" color="sub">
                {t('auth.forgotPassword.description')}
              </ThemedText>
            </ThemedView>

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
              <PrimaryButton label={t('auth.forgotPassword.submit')} onPress={handleSubmit} loading={loading} disabled={!email.trim()} />
            </ThemedView>

            <ThemedView style={styles.footer}>
              <Link href="/(auth)/login" replace>
                <ThemedText type="caption" color="accentInk" style={styles.link}>
                  {t('auth.forgotPassword.backToLogin')}
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
  header: {
    gap: Spacing.two,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  form: {
    gap: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  link: {
    fontWeight: '700',
  },
});
