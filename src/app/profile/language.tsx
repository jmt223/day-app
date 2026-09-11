import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { LocaleSetting } from '@/i18n/store';

const OPTIONS: { key: LocaleSetting; labelKey: 'language.system' | 'language.ko' | 'language.en'; hintKey?: 'language.systemHint' }[] = [
  { key: 'system', labelKey: 'language.system', hintKey: 'language.systemHint' },
  { key: 'ko', labelKey: 'language.ko' },
  { key: 'en', labelKey: 'language.en' },
];

export default function LanguageScreen() {
  const theme = useTheme();
  const { t, localeSetting, setLocaleSetting } = useLocale();

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="caption" color="muted">
          {t('language.description')}
        </ThemedText>

        <View style={[styles.list, { borderColor: theme.line }]}>
          {OPTIONS.map((option, index) => {
            const isSelected = localeSetting === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setLocaleSetting(option.key)}
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
