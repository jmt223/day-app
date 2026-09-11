import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useProtectedPhoto } from '@/hooks/use-protected-photo';
import { useTheme } from '@/hooks/use-theme';
import type { DayDoc } from '@/types/day';

export function DayCard({ day, meta, onPress }: { day: DayDoc; meta: string; onPress: () => void }) {
  const theme = useTheme();
  const cover = useProtectedPhoto(day.photoURLs[0]);

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={[styles.thumb, { backgroundColor: theme.card }]}>
        {cover ? (
          <Image source={cover} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Ionicons name="image-outline" size={24} color={theme.muted} />
        )}
      </View>
      <ThemedText type="label" numberOfLines={1}>
        {day.title}
      </ThemedText>
      <ThemedText type="caption" color="sub" numberOfLines={1}>
        {meta}
      </ThemedText>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Ionicons name="heart-outline" size={12} color={theme.muted} />
          <ThemedText type="caption" color="muted">
            {day.likeCount}
          </ThemedText>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="chatbubble-outline" size={12} color={theme.muted} />
          <ThemedText type="caption" color="muted">
            {day.commentCount}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

export const DAY_CARD_WIDTH = 126;
const CARD_WIDTH = DAY_CARD_WIDTH;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    gap: 7,
  },
  thumb: {
    width: CARD_WIDTH,
    height: 150,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
});

export const DAY_CARD_ROW_GAP = Spacing.three;
