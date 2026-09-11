import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegalDocumentModal } from '@/components/legal-document-modal';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { privacyPolicy } from '@/content/privacy-policy';
import { terms } from '@/content/terms';
import { recordConsent } from '@/data/users';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { notify } from '@/utils/confirm';

type ConsentKey = 'age' | 'terms' | 'privacy';

/** 가입 직후(이메일/구글/카카오 어느 방법이든) 딱 한 번, 앱의 다른 화면을
 * 쓰기 전에 이용약관·개인정보처리방침 동의를 받는 화면. _layout.tsx가 아직
 * Stack을 마운트하지 않고 이 컴포넌트를 통째로 대신 그리는 상태라(
 * EmailVerifyGate와 동일한 패턴), /terms·/privacy-policy로 라우팅할 수
 * 없어서 본문은 모달로 그 자리에서 보여준다. */
export function ConsentGate() {
  const theme = useTheme();
  const { t, locale } = useLocale();
  const { user, refreshProfile, signOutUser } = useAuth();
  const [checked, setChecked] = useState<Record<ConsentKey, boolean>>({ age: false, terms: false, privacy: false });
  const [openDoc, setOpenDoc] = useState<'terms' | 'privacy' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allChecked = checked.age && checked.terms && checked.privacy;

  function toggle(key: ConsentKey) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAll() {
    const next = !allChecked;
    setChecked({ age: next, terms: next, privacy: next });
  }

  async function handleSubmit() {
    if (!user || !allChecked) return;
    setSubmitting(true);
    try {
      await recordConsent(user.uid);
      await refreshProfile();
    } catch {
      notify(t('common.error'), t('consentGate.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  const rows: { key: ConsentKey; label: string; hasLink?: 'terms' | 'privacy' }[] = [
    { key: 'age', label: t('consentGate.age') },
    { key: 'terms', label: t('consentGate.terms'), hasLink: 'terms' },
    { key: 'privacy', label: t('consentGate.privacy'), hasLink: 'privacy' },
  ];

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <View style={styles.container}>
          <ThemedText type="heading">{t('consentGate.title')}</ThemedText>
          <ThemedText type="body" color="sub" style={styles.body}>
            {t('consentGate.body')}
          </ThemedText>

          <Pressable onPress={toggleAll} style={[styles.agreeAllRow, { borderColor: theme.line }]}>
            <Ionicons name={allChecked ? 'checkbox' : 'square-outline'} size={22} color={allChecked ? theme.accent : theme.muted} />
            <ThemedText type="label">{t('consentGate.agreeAll')}</ThemedText>
          </Pressable>

          <View style={styles.rows}>
            {rows.map((row) => (
              <View key={row.key} style={styles.row}>
                <Pressable onPress={() => toggle(row.key)} style={styles.rowMain} hitSlop={4}>
                  <Ionicons
                    name={checked[row.key] ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={checked[row.key] ? theme.accent : theme.muted}
                  />
                  <ThemedText type="body">{row.label}</ThemedText>
                </Pressable>
                {row.hasLink && (
                  <Pressable onPress={() => setOpenDoc(row.hasLink!)} hitSlop={8}>
                    <ThemedText type="caption" color="accentInk" style={styles.viewLink}>
                      {t('consentGate.view')}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <PrimaryButton label={t('consentGate.submit')} onPress={handleSubmit} loading={submitting} disabled={!allChecked} />
            <PrimaryButton label={t('emailGate.signOut')} variant="outline" onPress={signOutUser} />
          </View>
        </View>
      </SafeAreaView>

      <LegalDocumentModal visible={openDoc === 'terms'} onClose={() => setOpenDoc(null)} content={terms[locale]} />
      <LegalDocumentModal visible={openDoc === 'privacy'} onClose={() => setOpenDoc(null)} content={privacyPolicy[locale]} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.three,
  },
  body: {
    marginBottom: Spacing.one,
  },
  agreeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
  },
  rows: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  viewLink: {
    textDecorationLine: 'underline',
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
});
