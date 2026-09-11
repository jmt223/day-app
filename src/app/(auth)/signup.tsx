import { Link } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { FormField } from '@/components/form-field';
import { PhotoCropModal } from '@/components/photo-crop-modal';
import { PrimaryButton } from '@/components/primary-button';
import { SocialSignInButtons } from '@/components/social-sign-in-buttons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/hooks/use-locale';
import { describeAuthError } from '@/utils/auth-errors';
import { notify } from '@/utils/confirm';
import { validatePassword } from '@/utils/password-policy';

export default function SignupScreen() {
  const { t } = useLocale();
  const { signUp } = useAuth();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [photoLocalUri, setPhotoLocalUri] = useState<string | null>(null);
  const [pendingCrop, setPendingCrop] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordError = password.length > 0 ? validatePassword(password) : null;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit =
    nickname.trim().length > 0 &&
    email.trim().length > 0 &&
    !passwordError &&
    passwordsMatch &&
    !loading;

  // DAY 사진과 같은 이유(플랫폼마다 allowsEditing/aspect 동작이 다르거나 웹은
  // 아예 무시함)로, 원본은 그대로 받아오기만 하고 실제 자르기는 항상 같은
  // 방식으로 동작하는 PhotoCropModal에서 손가락으로 직접 하게 한다.
  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify(t('write.photoPermissionTitle'), t('write.photoPermissionMessage'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setPendingCrop({ uri: asset.uri, width: asset.width, height: asset.height });
  }

  async function handleSubmit() {
    if (passwordError) {
      notify(t('auth.signup.passwordCheckTitle'), passwordError);
      return;
    }
    if (!passwordsMatch) {
      notify(t('auth.signup.passwordCheckTitle'), t('auth.signup.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, nickname, photoLocalUri ?? undefined);
    } catch (error) {
      notify(t('auth.signup.failedTitle'), describeAuthError(error));
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
              <ThemedText type="heading">{t('auth.signup.title')}</ThemedText>
              <ThemedText type="body" color="sub">
                {t('auth.signup.subtitle')}
              </ThemedText>
            </ThemedView>

            <ThemedView style={styles.form}>
              <View style={styles.avatarBlock}>
                <Pressable onPress={handlePickPhoto}>
                  <Avatar uri={photoLocalUri} size={72} />
                </Pressable>
                <Pressable onPress={handlePickPhoto}>
                  <ThemedText type="caption" color="accentInk">
                    {photoLocalUri ? t('auth.signup.photoChange') : t('auth.signup.photoAdd')}
                  </ThemedText>
                </Pressable>
              </View>
              <FormField
                label={t('auth.signup.nicknameLabel')}
                value={nickname}
                onChangeText={setNickname}
                placeholder={t('auth.signup.nicknamePlaceholder')}
                maxLength={30}
              />
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
                placeholder={t('auth.signup.passwordPlaceholder')}
              />
              {passwordError && (
                <ThemedText type="caption" color="danger">
                  {passwordError}
                </ThemedText>
              )}
              <FormField
                label={t('auth.signup.confirmPasswordLabel')}
                secureTextEntry
                autoCapitalize="none"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder={t('auth.signup.confirmPasswordPlaceholder')}
              />
              <PrimaryButton label={t('auth.signup.submit')} onPress={handleSubmit} loading={loading} disabled={!canSubmit} />
              {/* 실제 필수 동의(이용약관/개인정보처리방침/만 14세 이상)는
                  가입 직후 ConsentGate에서 체크박스로 받는다 — 여긴 폼을
                  채우기 전에 미리 훑어볼 수 있게 걸어두는 링크일 뿐이다. */}
              <View style={styles.privacyLinkRow}>
                <Link href="/terms">
                  <ThemedText type="caption" color="muted" style={styles.privacyLinkText}>
                    {t('header.terms')}
                  </ThemedText>
                </Link>
                <ThemedText type="caption" color="muted">
                  ·
                </ThemedText>
                <Link href="/privacy-policy">
                  <ThemedText type="caption" color="muted" style={styles.privacyLinkText}>
                    {t('header.privacyPolicy')}
                  </ThemedText>
                </Link>
              </View>
            </ThemedView>

            <SocialSignInButtons />

            <ThemedView style={styles.footer}>
              <ThemedText type="caption" color="sub">
                {t('auth.signup.hasAccount')}
              </ThemedText>
              <Link href="/(auth)/login" replace>
                <ThemedText type="caption" color="accentInk" style={styles.link}>
                  {t('auth.signup.loginLink')}
                </ThemedText>
              </Link>
            </ThemedView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {pendingCrop && (
        <PhotoCropModal
          imageUri={pendingCrop.uri}
          naturalWidth={pendingCrop.width}
          naturalHeight={pendingCrop.height}
          aspect="square"
          onCancel={() => setPendingCrop(null)}
          onConfirm={(croppedUri) => {
            setPhotoLocalUri(croppedUri);
            setPendingCrop(null);
          }}
        />
      )}
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
  avatarBlock: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.one,
  },
  form: {
    gap: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  link: {
    fontWeight: '700',
  },
  privacyLinkRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
  privacyLinkText: {
    textDecorationLine: 'underline',
  },
});
