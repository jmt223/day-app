import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function Avatar({ uri, size = 36 }: { uri: string | null | undefined; size?: number }) {
  const theme = useTheme();
  // 완전한 원이 아니라 살짝 둥근 사각형(라운드 스퀘어)으로. 크기가 달라져도
  // 비슷한 둥근 정도로 보이도록 절대값이 아니라 size에 비례한 radius를 쓴다.
  const dimension = { width: size, height: size, borderRadius: size * 0.28 };

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimension]} contentFit="cover" />;
  }

  return (
    <View style={[styles.placeholder, dimension, { backgroundColor: theme.card }]}>
      <Ionicons name="person" size={size * 0.5} color={theme.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {},
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
