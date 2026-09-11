import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { TranslationKey } from '@/i18n/translations';

const PREVIEW_ROWS: { dayTypeKey: TranslationKey; productsKey: TranslationKey; icon: keyof typeof import('@expo/vector-icons/Ionicons').default.glyphMap }[] = [
  { dayTypeKey: 'shop.row100Day', productsKey: 'shop.row100DayProducts', icon: 'gift-outline' },
  { dayTypeKey: 'shop.rowBirthday', productsKey: 'shop.rowBirthdayProducts', icon: 'balloon-outline' },
  { dayTypeKey: 'shop.rowTrip', productsKey: 'shop.rowTripProducts', icon: 'airplane-outline' },
  { dayTypeKey: 'shop.rowExport', productsKey: 'shop.rowExportProducts', icon: 'albums-outline' },
];

export default function ShopScreen() {
  const theme = useTheme();
  const { t } = useLocale();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.container}>
          <ThemedText type="title">{t('shop.title')}</ThemedText>

          <ThemedView surface="surface" style={[styles.hero, { borderColor: theme.line }]}>
            <Ionicons name="storefront-outline" size={28} color={theme.accent} />
            <ThemedText type="heading" style={styles.heroTitle}>
              {t('shop.comingSoon')}
            </ThemedText>
            <ThemedText type="body" color="sub" style={styles.heroBody}>
              {t('shop.comingSoonDescription')}
            </ThemedText>
          </ThemedView>

          <ThemedText type="label" style={styles.sectionTitle}>
            {t('shop.previewSectionTitle')}
          </ThemedText>

          {PREVIEW_ROWS.map((row) => (
            <View key={row.dayTypeKey} style={[styles.row, { borderColor: theme.line }]}>
              <ThemedView surface="accentSoft" style={styles.rowIcon}>
                <Ionicons name={row.icon} size={17} color={theme.accent} />
              </ThemedView>
              <View style={styles.rowText}>
                <ThemedText type="label">{t(row.dayTypeKey)}</ThemedText>
                <ThemedText type="caption" color="sub">
                  {t(row.productsKey)}
                </ThemedText>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
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
  hero: {
    alignItems: 'center',
    padding: Spacing.five,
    borderRadius: Radius.large,
    borderWidth: 1,
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  heroTitle: {
    letterSpacing: 1,
  },
  heroBody: {
    textAlign: 'center',
  },
  sectionTitle: {
    marginTop: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    gap: 2,
  },
});
