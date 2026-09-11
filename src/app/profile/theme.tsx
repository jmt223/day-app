import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeSetting, type ThemeSetting } from '@/context/theme-context';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';

const OPTIONS: { key: ThemeSetting; labelKey: 'theme.system' | 'theme.light' | 'theme.dark'; hintKey?: 'theme.systemHint' }[] = [
  { key: 'system', labelKey: 'theme.system', hintKey: 'theme.systemHint' },
  { key: 'light', labelKey: 'theme.light' },
  { key: 'dark', labelKey: 'theme.dark' },
];

export default function ThemeScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { themeSetting, setThemeSetting } = useThemeSetting();

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="caption" color="muted">
          {t('theme.description')}
        </ThemedText>

        <View style={[styles.list, { borderColor: theme.line }]}>
          {OPTIONS.map((option, index) => {
            const isSelected = themeSetting === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setThemeSetting(option.key)}
                style={[styles.row, index < OPTIONS.length - 1 && { borderBottomWidth: 1, borderColor: theme.line }]}>
                <View style={styles.rowText}>
                  <ThemedText type="body">{t(option.labelKey)}</ThemedText>
                  {option.hintKey && (
                    <ThemedText type="caption" color="sub">
                      {t(option.hintKey)}
                    </ThemedText>
                  )}
                </View>
                {isSelected && <Ionicons name="checkmark" size={20} color={theme.accent} />}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  list: {
    borderRadius: Radius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
});
