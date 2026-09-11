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
  style?: ViewStyle;
};

export function PrimaryButton({ label, onPress, loading, disabled, variant = 'solid', style }: Props) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const solid = variant === 'solid';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        solid
          ? { backgroundColor: theme.accent, opacity: isDisabled ? 0.6 : 1 }
          : { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.line, opacity: isDisabled ? 0.6 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={solid ? theme.onAccent : theme.ink} />
      ) : (
        <ThemedText type="button" color={solid ? 'onAccent' : 'ink'}>
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
