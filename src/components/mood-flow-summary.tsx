import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { moodOptions } from '@/constants/mood';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { MoodKey } from '@/types/day';

/**
 * 연혁 화면에서 "지금 보고 있는 기간에 무드 태그를 얼마나 남겼는지"를
 * 막대 그래프로 한눈에 보여준다(PRD의 "감정 흐름을 한눈에 보기"). 새 차트
 * 라이브러리 없이 View 하나로 막대를 그린다 — 굳이 라이브러리가 필요할
 * 만큼 복잡한 그래프가 아니고, 웹/네이티브 모두에서 추가 설정 없이 그대로
 * 동작한다.
 */
export function MoodFlowSummary({ days }: { days: { moodTag: MoodKey | null }[] }) {
  const theme = useTheme();
  const { t } = useLocale();

  const counts = useMemo(() => {
    const map = new Map<MoodKey, number>();
    for (const d of days) {
      if (!d.moodTag) continue;
      map.set(d.moodTag, (map.get(d.moodTag) ?? 0) + 1);
    }
    return moodOptions()
      .map((m) => ({ ...m, count: map.get(m.key) ?? 0 }))
      .filter((m) => m.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [days]);

  if (counts.length === 0) return null;
  const maxCount = counts[0].count;

  return (
    <View style={styles.container}>
      <ThemedText type="label" color="sub">
        {t('history.moodFlowTitle')}
      </ThemedText>
      <View style={styles.rows}>
        {counts.map((m) => (
          <View key={m.key} style={styles.row}>
            <Ionicons name={m.icon} size={16} color={theme.accent} style={styles.rowIcon} />
            <View style={[styles.barTrack, { backgroundColor: theme.card }]}>
              <View style={[styles.barFill, { backgroundColor: theme.accent, width: `${(m.count / maxCount) * 100}%` }]} />
            </View>
            <ThemedText type="caption" color="muted" style={styles.count}>
              {m.count}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  rows: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowIcon: {
    width: 18,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  count: {
    width: 20,
    textAlign: 'right',
  },
});
