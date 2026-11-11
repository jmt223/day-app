import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MailboxPanel } from '@/components/mailbox-panel';
import { PetsPanel } from '@/components/pets-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';

type Section = 'mailbox' | 'pets';

/**
 * 편지함 탭 — 위쪽에서 "편지함"(친구별 대화방 목록)과 "내 펫"(펫 상태·친밀도·
 * 배달 기록)을 오간다. 예전의 받은 편지/보낸 편지 구분은 대화창(친구 한 명과
 * 주고받은 편지를 시간순으로 모아 보여줌) 안으로 합쳤다.
 */
export default function LettersScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>(params.section === 'pets' ? 'pets' : 'mailbox');

  // 다른 화면에서 "내 펫"으로 바로 보내는 경우(예: 펫이 없어서 데려오러 가기).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (params.section === 'pets' || params.section === 'mailbox') setSection(params.section);
  }, [params.section]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="title">{t('letters.screenTitle')}</ThemedText>
          <Pressable
            onPress={() => router.push('/letters/compose')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('header.letterCompose')}>
            <Ionicons name="create-outline" size={22} color={theme.leaf} />
          </Pressable>
        </View>

        <View style={[styles.tabRow, { borderColor: theme.line }]}>
          {(['mailbox', 'pets'] as const).map((key) => {
            const active = section === key;
            return (
              <Pressable
                key={key}
                style={styles.tabButton}
                onPress={() => setSection(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}>
                <ThemedText type="label" color={active ? 'ink' : 'muted'}>
                  {key === 'mailbox' ? t('letters.sectionMailbox') : t('letters.sectionPets')}
                </ThemedText>
                <View style={[styles.tabUnderline, { backgroundColor: active ? theme.leaf : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>

        {section === 'mailbox' ? <MailboxPanel /> : <PetsPanel />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    marginTop: Spacing.three,
  },
  tabButton: {
    paddingTop: Spacing.two,
    marginRight: Spacing.four,
    alignItems: 'center',
    gap: 6,
  },
  tabUnderline: {
    height: 2,
    alignSelf: 'stretch',
    borderRadius: 1,
  },
});
