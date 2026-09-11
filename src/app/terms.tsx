import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { terms } from '@/content/terms';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';

/** privacy-policy.tsx와 같은 이유로 로그인 여부와 무관하게 항상 열람
 * 가능해야 한다 — _layout.tsx에서 Stack.Protected로 감싸지 않는다. */
export default function TermsScreen() {
  const theme = useTheme();
  const { locale } = useLocale();
  const content = terms[locale];

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <ThemedText type="heading">{content.title}</ThemedText>
          <ThemedText type="caption" color="muted">
            {content.effectiveDateLabel}
          </ThemedText>
        </View>

        <ThemedText type="body" color="sub">
          {content.intro}
        </ThemedText>

        {content.sections.map((section) => (
          <View key={section.heading} style={[styles.section, { borderColor: theme.line }]}>
            <ThemedText type="label">{section.heading}</ThemedText>
            <ThemedText type="body" color="sub">
              {section.body}
            </ThemedText>
          </View>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  header: {
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
    borderTopWidth: 1,
  },
});
