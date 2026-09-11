import { Alert, Platform } from 'react-native';

import { t } from '@/i18n/store';

/**
 * Alert.alert는 react-native-web에서 버튼/콜백이 제대로 동작하지 않거나
 * 아무 반응이 없을 수 있다. 알림/확인 다이얼로그는 항상 이 유틸을 통해서만
 * 띄운다 (컴포넌트에서 Alert.alert를 직접 호출하지 않는다).
 */
export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}


export function confirmAsync(title: string, message: string, confirmLabel?: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel ?? t('common.confirm'), style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
