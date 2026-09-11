import { Platform } from 'react-native';

import { t } from '@/i18n/store';
import { auth } from '@/lib/firebase';
import { photoProxyUrl } from '@/utils/photo-url';

export class SaveImageError extends Error {}

async function authorizedPhotoUrl(pathOrLegacyUrl: string): Promise<{ url: string; headers: Record<string, string> }> {
  const user = auth?.currentUser;
  if (!user) throw new SaveImageError(t('saveImage.loginRequired'));
  const token = await user.getIdToken();
  return { url: photoProxyUrl(pathOrLegacyUrl), headers: { Authorization: `Bearer ${token}` } };
}

/**
 * DAY 사진을 기기(모바일)나 브라우저(웹)에 저장한다. `path`는 이제 공개
 * 다운로드 URL이 아니라 Storage 경로(또는 예전에 저장된 레거시 URL)라서,
 * servePhoto Cloud Function을 인증 헤더와 함께 호출해서 바이트를 받아온다.
 * 모바일: 갤러리 저장 권한 요청 → 캐시로 다운로드 → 미디어 라이브러리에 저장.
 * 웹: fetch로 blob을 받아 임시 다운로드 링크를 클릭시켜 저장한다.
 */
export async function savePhotoToDevice(path: string): Promise<void> {
  if (Platform.OS === 'web') {
    await saveOnWeb(path);
    return;
  }
  await saveOnNative(path);
}

async function saveOnNative(path: string): Promise<void> {
  const [MediaLibrary, FileSystem] = await Promise.all([
    import('expo-media-library/legacy'),
    import('expo-file-system/legacy'),
  ]);

  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new SaveImageError(t('saveImage.galleryPermission'));
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new SaveImageError(t('saveImage.noCacheDir'));
  }

  const { url, headers } = await authorizedPhotoUrl(path);
  const localUri = `${cacheDir}day-${Date.now()}.jpg`;
  const { uri } = await FileSystem.downloadAsync(url, localUri, { headers });
  await MediaLibrary.saveToLibraryAsync(uri);
}

async function saveOnWeb(path: string): Promise<void> {
  const { url, headers } = await authorizedPhotoUrl(path);
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new SaveImageError(t('saveImage.fetchFailed'));
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `day-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
