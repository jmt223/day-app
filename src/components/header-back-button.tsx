import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 헤더 왼쪽에 직접 그리는 뒤로가기 버튼. react-navigation의 기본 뒤로가기
 * 버튼은 "이동 기록이 있을 때만" 뜨는데, 새로고침/딥링크/북마크로 이
 * 화면에 곧장 들어오면(또는 언어 변경처럼 이 화면에서 새로고침이 일어나면)
 * 기록이 없어서 기본 버튼 자체가 아예 안 뜨고, 그러면 사용자가 이 화면에
 * 갇혀서 나갈 방법이 없어진다. 그래서 모든 헤더 달린 화면에서 이 버튼을
 * 직접 그리고, 기록이 있으면 뒤로가기, 없으면 이 화면의 "논리적 부모"
 * 화면으로 보낸다.
 */
export function HeaderBackButton({ fallbackHref }: { fallbackHref: Href }) {
  const theme = useTheme();
  return (
    <Pressable
      hitSlop={12}
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(fallbackHref);
        }
      }}
      style={styles.button}>
      <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={24} color={theme.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
});
