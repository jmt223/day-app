import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type LegalContent = {
  title: string;
  effectiveDateLabel: string;
  intro: string;
  sections: { heading: string; body: string }[];
};

/** ConsentGate처럼 아직 앱 내비게이션(Stack)이 뜨기 전(로그인/이메일인증/
 * 약관동의 게이트 화면들)에서도 이용약관·개인정보처리방침 본문을 그 자리에서
 * 바로 보여줘야 할 때 쓴다 — /terms, /privacy-policy 라우트로 이동하려면
 * Stack 자체가 마운트돼 있어야 하는데, 게이트 화면들은 Stack 대신 통째로
 * 렌더링되는 컴포넌트라 router.push가 갈 곳이 없다. */
export function LegalDocumentModal({
  visible,
  onClose,
  content,
}: {
  visible: boolean;
  onClose: () => void;
  content: LegalContent;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex}>
          <View style={[styles.header, { borderColor: theme.line }]}>
            <ThemedText type="title" style={styles.headerTitle} numberOfLines={1}>
              {content.title}
            </ThemedText>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={theme.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.container}>
            <ThemedText type="caption" color="muted">
              {content.effectiveDateLabel}
            </ThemedText>
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
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
  },
  container: {
    padding: Spacing.four,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  section: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
    borderTopWidth: 1,
  },
});
