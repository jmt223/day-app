import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { TranslationKey } from '@/i18n/translations';
import type { ReportReason } from '@/types/user';

const REASONS: { key: ReportReason; labelKey: TranslationKey }[] = [
  { key: 'spam', labelKey: 'report.reasonSpam' },
  { key: 'abuse', labelKey: 'report.reasonAbuse' },
  { key: 'inappropriate', labelKey: 'report.reasonInappropriate' },
  { key: 'other', labelKey: 'report.reasonOther' },
];

export function ReportModal({
  visible,
  onClose,
  onSubmit,
  submitting,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason, detail: string) => void;
  submitting?: boolean;
}) {
  const theme = useTheme();
  const { t } = useLocale();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [detail, setDetail] = useState('');

  // 모달이 새로 열릴 때만 초기화한다 — 신고가 실패해서 모달이 계속 떠있는
  // 동안(부모가 reportTarget을 안 지운 상태) 여기서 입력해둔 detail을
  // 지워버리면, 실패할 때마다 처음부터 다시 써야 해서 불편하다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible) {
      setReason('spam');
      setDetail('');
    }
  }, [visible]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit() {
    onSubmit(reason, detail.trim());
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <ThemedText type="label">{t('report.title')}</ThemedText>
          <View style={styles.reasonList}>
            {REASONS.map((r) => {
              const active = reason === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setReason(r.key)}
                  style={[
                    styles.reasonChip,
                    active ? { backgroundColor: theme.accent } : { backgroundColor: theme.card },
                  ]}>
                  <ThemedText type="caption" color={active ? 'onAccent' : 'sub'}>
                    {t(r.labelKey)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <FormField
            value={detail}
            onChangeText={setDetail}
            placeholder={t('report.detailPlaceholder')}
            multiline
            numberOfLines={3}
            maxLength={500}
          />
          <PrimaryButton label={t('report.submit')} onPress={handleSubmit} loading={submitting} style={styles.submitButton} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    gap: Spacing.three,
  },
  reasonList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  reasonChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  submitButton: {
    marginTop: Spacing.one,
  },
});
