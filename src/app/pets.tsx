import { StyleSheet } from 'react-native';

import { PetsPanel } from '@/components/pets-panel';
import { ThemedView } from '@/components/themed-view';

/** 프로필 메뉴의 "내 펫" — 편지함 탭의 "내 펫" 칸과 같은 화면을 그대로 보여준다. */
export default function PetsScreen() {
  return (
    <ThemedView style={styles.flex}>
      <PetsPanel />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
