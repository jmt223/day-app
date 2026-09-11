import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from '@firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { FormField } from '@/components/form-field';
import { PhotoCropModal } from '@/components/photo-crop-modal';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { prepareAccountDeletion, uploadAvatar } from '@/data/users';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { confirmAsync, notify } from '@/utils/confirm';
import { unregisterPushNotifications } from '@/utils/push-notifications';
import { validatePassword } from '@/utils/password-policy';

export default function ProfileEditScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user, profile, updateProfileFields } = useAuth();
  // 구글/카카오로 로그인한 계정은 비밀번호 자체가 없다 — "비밀번호 변경"은
  // 애초에 의미가 없어서 숨기고, "계정 탈퇴"도 비밀번호로 본인 확인을 할
  // 방법이 없으니 그 확인 단계 없이 바로 탈퇴하게 한다.
  const isPasswordAccount = user?.providerData.some((p) => p.providerId === 'password') ?? false;

  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL ?? null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<{ uri: string; width: number; height: number } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  // DAY 사진과 같은 이유(allowsEditing/aspect가 Android만 실제로 비율대로
  // 자르고, iOS는 무조건 정사각형, 웹은 아예 무시하는 플랫폼별 제약)로 원본만
  // 받아오고, 실제 자르기는 항상 동일하게 동작하는 PhotoCropModal에서 한다.
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

  async function handleCropConfirm(croppedUri: string) {
    setPendingCrop(null);
    if (!user) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadAvatar(user.uid, croppedUri);
      setPhotoURL(url);
    } catch {
      notify(t('common.error'), t('profileEdit.photoUploadFailed'));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      await updateProfileFields({ nickname: nickname.trim(), bio: bio.trim(), photoURL });
      // 새로고침/딥링크로 이 화면에 곧장 들어왔으면 이동 기록이 없어서
      // back()이 조용히 아무 일도 안 할 수 있다 — 그럴 땐 프로필로.
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/profile');
      }
    } catch {
      notify(t('common.error'), t('profileEdit.saveFailed'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (!user || !user.email) return;
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      notify(t('profileEdit.changePasswordTitle'), passwordError);
      return;
    }
    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      notify(t('profileEdit.passwordChangedTitle'), t('profileEdit.passwordChangedMessage'));
    } catch {
      notify(t('common.error'), t('profileEdit.passwordChangeFailed'));
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user) return;
    const ok = await confirmAsync(t('profileEdit.deleteConfirmTitle'), t('profileEdit.deleteConfirmMessage'), t('profileEdit.deleteConfirmLabel'));
    if (!ok) return;
    setDeleting(true);
    try {
      if (isPasswordAccount) {
        if (!user.email) throw new Error('no-email');
        const credential = EmailAuthProvider.credential(user.email, deletePassword);
        await reauthenticateWithCredential(user, credential);
      }
      // 구글/카카오 계정은 비밀번호로 본인 확인을 할 수 없어서(재로그인
      // 절차를 다시 태우는 대신) 위 "계정 탈퇴" 확인 한 번으로 충분하다고
      // 판단해 바로 진행한다.
      // Auth 계정을 지우기 전에 개인 식별 정보부터 정리한다(순서가 바뀌면
      // 이 정리 자체가 권한 오류로 실패한다). 푸시 토큰도 마찬가지로
      // 로그인이 살아있는 동안에만 뗄 수 있다.
      await unregisterPushNotifications(user.uid);
      await prepareAccountDeletion(user.uid, user.email);
      await deleteUser(user);
    } catch {
      notify(t('common.error'), isPasswordAccount ? t('profileEdit.deleteFailedPassword') : t('profileEdit.deleteFailedGeneric'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.avatarBlock}>
          <Avatar uri={photoURL} size={84} />
          <Pressable onPress={handlePickPhoto} disabled={uploadingPhoto}>
            <ThemedText type="caption" color="accentInk">
              {uploadingPhoto ? t('profileEdit.uploading') : t('profileEdit.changePhoto')}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.section}>
          <FormField label={t('profileEdit.nicknameLabel')} value={nickname} onChangeText={setNickname} maxLength={30} />
          <FormField
            label={t('profileEdit.bioLabel')}
            value={bio}
            onChangeText={setBio}
            placeholder={t('profileEdit.bioPlaceholder')}
            multiline
            maxLength={200}
          />
          <PrimaryButton label={t('profileEdit.save')} onPress={handleSaveProfile} loading={savingProfile} disabled={!nickname.trim()} />
        </View>

        {isPasswordAccount && (
          <>
            <View style={[styles.divider, { backgroundColor: theme.line }]} />

            <View style={styles.section}>
              <ThemedText type="label">{t('profileEdit.changePasswordTitle')}</ThemedText>
              <FormField label={t('profileEdit.currentPasswordLabel')} secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
              <FormField
                label={t('profileEdit.newPasswordLabel')}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder={t('profileEdit.newPasswordPlaceholder')}
              />
              <PrimaryButton
                label={t('profileEdit.changePassword')}
                variant="outline"
                onPress={handleChangePassword}
                loading={changingPassword}
                disabled={!currentPassword || !!validatePassword(newPassword)}
              />
            </View>
          </>
        )}

        <View style={[styles.divider, { backgroundColor: theme.line }]} />

        <View style={styles.section}>
          <ThemedText type="label" color="danger">
            {t('profileEdit.dangerZone')}
          </ThemedText>
          {isPasswordAccount && (
            <FormField label={t('profileEdit.deletePasswordLabel')} secureTextEntry value={deletePassword} onChangeText={setDeletePassword} />
          )}
          <PrimaryButton
            label={t('profileEdit.deleteAccount')}
            variant="outline"
            onPress={handleDeleteAccount}
            loading={deleting}
            disabled={isPasswordAccount && !deletePassword}
          />
        </View>
      </ScrollView>
      {pendingCrop && (
        <PhotoCropModal
          imageUri={pendingCrop.uri}
          naturalWidth={pendingCrop.width}
          naturalHeight={pendingCrop.height}
          aspect="square"
          onCancel={() => setPendingCrop(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  section: {
    gap: Spacing.three,
  },
  divider: {
    height: 1,
  },
});
