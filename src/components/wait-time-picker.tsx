import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { formatWaitMinutes, WAIT_MINUTE_OPTIONS, type WaitMinutes } from '@/constants/pets';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 답장 대기시간 고르기(5분 ~ 24시간). 좁은 화면에서도 한 줄로 넘겨볼 수 있게
 * 가로 스크롤로 둔다. */
export function WaitTimePicker({ value, onChange }: { value: WaitMinutes; onChange: (next: WaitMinutes) => void }) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {WAIT_MINUTE_OPTIONS.map((minutes) => {
        const active = minutes === value;
        return (
          <Pressable
            key={minutes}
            onPress={() => onChange(minutes)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.chip,
              { borderColor: active ? theme.leaf : theme.line, backgroundColor: active ? theme.leafSoft : theme.surface },
            ]}>
            <ThemedText type="caption" color={active ? 'leaf' : 'sub'} style={active ? styles.activeText : undefined}>
              {formatWaitMinutes(minutes)}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  activeText: {
    fontWeight: '700',
  },
});
