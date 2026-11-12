import { Pressable, StyleSheet, View } from 'react-native';

import { DayThumb } from '@/components/day-thumb';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DayDoc } from '@/types/day';
import { previewTextFromBlocks } from '@/utils/content-blocks';
import { formatDayLabelShort } from '@/utils/date';

export function TimelineCard({
  day,
  isLast,
  onPress,
}: {
  day: DayDoc;
  isLast: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.railColumn}>
        <View style={[styles.dot, { backgroundColor: theme.accent }]} />
        {!isLast && <View style={[styles.rail, { backgroundColor: theme.line }]} />}
      </View>
      <Pressable onPress={onPress} style={styles.content}>
        <ThemedText type="caption" color="sub">
          {formatDayLabelShort(day.dateLabel)}
        </ThemedText>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}>
          <DayThumb day={day} variant="small" style={styles.thumb} />
          <View style={styles.textBlock}>
            <ThemedText type="label" numberOfLines={1}>
              {day.title}
            </ThemedText>
            <ThemedText type="caption" color="sub" numberOfLines={2}>
              {previewTextFromBlocks(day.contentBlocks)}
            </ThemedText>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  railColumn: {
    width: 8,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  rail: {
    width: 1.5,
    flex: 1,
    marginTop: 4,
  },
  content: {
    flex: 1,
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  card: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.medium,
  },
  textBlock: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
});
