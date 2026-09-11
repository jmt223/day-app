import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { addPushToken, removePushToken } from '@/data/users';

// 이걸 등록해두지 않으면, 앱을 이미 켜놓은 상태(포그라운드)에서 푸시가
// 와도 화면에 아무 표시가 안 뜬다(기기가 꺼져있거나 백그라운드일 때만
// OS 알림으로 보임). 앱을 보고 있을 때도 배너/소리/뱃지가 그대로 뜨게
// 한다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * 로그인한 기기를 이 계정의 푸시 대상으로 등록한다. 아래 경우엔 조용히
 * 아무것도 안 하고 끝낸다(에러로 취급하지 않음) — 셋 다 "안 되는 게
 * 정상"인 상황이라서다:
 *  - 웹: Expo 푸시 서비스는 iOS/Android에만 배달하고 브라우저 푸시는
 *    별도 체계(VAPID)라 이 경로로는 지원하지 않는다.
 *  - 시뮬레이터/에뮬레이터: 실기기가 아니면 푸시 토큰 자체가 발급 안 된다.
 *  - 알림 권한 거부: 사용자가 명시적으로 거부한 것이니 강요하지 않는다.
 */
export async function registerForPushNotifications(uid: string): Promise<void> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return;

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      console.warn('EAS projectId가 없어서 푸시 토큰을 발급받지 못했어요 (eas init 필요).');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await addPushToken(uid, token);

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  } catch (error) {
    console.warn('푸시 알림 등록 실패', error);
  }
}

/**
 * 로그아웃 직전에 호출해서, 이 기기의 푸시 토큰을 지금 로그아웃하는
 * 계정에서 뗀다. registerForPushNotifications와 똑같은 조건에서만
 * 동작하고(웹/시뮬레이터는 애초에 토큰이 없으니 조용히 넘어감), 토큰 자체는
 * Expo가 이 기기+앱 설치에 대해 항상 같은 값을 돌려주므로 등록 때와 같은
 * 방식으로 다시 구해서 정확히 그 값만 지운다(이 기기에 여러 계정이
 * 로그인했었어도 다른 계정의 토큰은 안 건드림).
 */
export async function unregisterPushNotifications(uid: string): Promise<void> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return;

    const existing = await Notifications.getPermissionsAsync();
    if (existing.status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await removePushToken(uid, token);
  } catch (error) {
    console.warn('푸시 토큰 해제 실패', error);
  }
}
