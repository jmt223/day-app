import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = TextInputProps & {
  label?: string;
  /** DAY 작성 화면처럼, 이 입력창에 고른 DAY 글씨체를 미리 보여주고 싶을 때만
   * 넘긴다. 안 넘기면 앱 공통 글씨체(FontFamily.sans)를 쓴다. */
  fontFamily?: string;
};

export function FormField({ label, style, fontFamily, secureTextEntry, maxLength, value, ...rest }: Props) {
  const theme = useTheme();
  // secureTextEntry가 있는 입력창(비밀번호)마다 각자 독립적으로 가림/보임을
  // 기억해야 하니, 화면 쪽 state가 아니라 이 컴포넌트 안에 둔다 — 비밀번호
  // 확인처럼 같은 화면에 비밀번호 입력창이 두 개 있어도 서로 안 엮인다.
  const [revealed, setRevealed] = useState(false);
  const showToggle = secureTextEntry !== undefined;

  return (
    <View style={styles.container}>
      {label ? (
        <ThemedText type="label" color="sub">
          {label}
        </ThemedText>
      ) : null}
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor={theme.muted}
          value={value}
          maxLength={maxLength}
          secureTextEntry={showToggle ? secureTextEntry && !revealed : secureTextEntry}
          style={[
            styles.input,
            {
              backgroundColor: theme.surface,
              borderColor: theme.line,
              color: theme.ink,
              fontFamily: fontFamily ?? FontFamily.sans,
            },
            rest.multiline && styles.multiline,
            showToggle && styles.inputWithToggle,
            style,
          ]}
          {...rest}
        />
        {showToggle && (
          <Pressable
            onPress={() => setRevealed((prev) => !prev)}
            hitSlop={8}
            style={styles.revealButton}
            accessibilityRole="button"
            accessibilityLabel={revealed ? '비밀번호 숨기기' : '비밀번호 보기'}>
            <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={19} color={theme.muted} />
          </Pressable>
        )}
      </View>
      {typeof maxLength === 'number' && typeof value === 'string' && (
        <ThemedText type="caption" color="muted" style={styles.counter}>
          {value.length}/{maxLength}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: 13,
    fontSize: 14.5,
  },
  inputWithToggle: {
    paddingRight: 44,
  },
  revealButton: {
    position: 'absolute',
    right: Spacing.three,
    padding: 2,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  counter: {
    textAlign: 'right',
  },
});
