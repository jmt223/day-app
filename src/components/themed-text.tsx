import { StyleSheet, Text, type TextProps } from 'react-native';

import { FontFamily, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'body' | 'caption' | 'label' | 'title' | 'heading' | 'display' | 'button';
  color?: ThemeColor;
};

export function ThemedText({ style, type = 'body', color, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[color ?? 'ink'] },
        type === 'body' && styles.body,
        type === 'caption' && styles.caption,
        type === 'label' && styles.label,
        type === 'title' && styles.title,
        type === 'heading' && styles.heading,
        type === 'display' && styles.display,
        type === 'button' && styles.button,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  body: {
    fontFamily: FontFamily.sans,
    fontSize: 14.5,
    lineHeight: 22,
  },
  caption: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 17,
  },
  label: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  title: {
    fontFamily: FontFamily.serifBold,
    fontSize: 19,
    lineHeight: 26,
  },
  heading: {
    fontFamily: FontFamily.serif,
    fontSize: 23,
    lineHeight: 32,
  },
  display: {
    fontFamily: FontFamily.serif,
    fontSize: 28,
    lineHeight: 38,
  },
  button: {
    fontFamily: FontFamily.sans,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
});
