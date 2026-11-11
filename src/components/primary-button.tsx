import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'solid' | 'outline';
  /** 펫 편지 화면은 목업처럼 초록(leaf) 버튼을 쓴다. 나머지는 기본 테라코타. */
  tone?: 'accent' | 'leaf';
  style?: ViewStyle;
};

export function PrimaryButton({ label, onPress, loading, disabled, variant = 'solid', tone = 'accent', style }: Props) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const solid = variant === 'solid';
  const onTone = tone === 'leaf' ? 'onLeaf' : 'onAccent';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        solid
          ? { backgroundColor: theme[tone], opacity: isDisabled ? 0.6 : 1 }
          : { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.line, opacity: isDisabled ? 0.6 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={solid ? theme[onTone] : theme.ink} />
      ) : (
        <ThemedText type="button" color={solid ? onTone : 'ink'}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
