import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { privacyPolicy } from '@/content/privacy-policy';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';

/**
 * 로그인 여부와 무관하게 항상 열람 가능해야 하는 화면이다(스토어 심사,
 * 구글/카카오 로그인 콘솔 검수, 아직 가입하지 않은 방문자 모두 봐야 하니까)
 * — 그래서 _layout.tsx에서 Stack.Protected로 감싸지 않고 최상위에 등록한다.
 */
export default function PrivacyPolicyScreen() {
  const theme = useTheme();
  const { locale } = useLocale();
  const content = privacyPolicy[locale];

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
