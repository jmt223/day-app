import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { DayThumb } from '@/components/day-thumb';
import { EmptyState } from '@/components/empty-state';
import { LoadingView } from '@/components/loading-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listLikedDays } from '@/data/days';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { DayDoc } from '@/types/day';
import { formatDayLabelShort } from '@/utils/date';
import { friendlyErrorMessage } from '@/utils/error-message';

function LikedDayRow({ item, borderColor, onPress }: { item: DayDoc; borderColor: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderColor }]}>
      <DayThumb day={item} variant="small" style={styles.thumb} />
      <View style={styles.textBlock}>
        <ThemedText type="label" numberOfLines={1}>
          {item.title}
        </ThemedText>
        <ThemedText type="caption" color="sub">
          {item.authorNickname} · {formatDayLabelShort(item.dateLabel)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export default function LikedDaysScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user } = useAuth();
  const [days, setDays] = useState<DayDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      setLoading(true);
      setLoadError(null);
      listLikedDays(user.uid)
        .then((list) => active && setDays(list))
        .catch((error) => {
          console.error('좋아요한 DAY를 불러오지 못했어요', error);
          if (active) setLoadError(friendlyErrorMessage(error));
        })
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [user])
  );

  if (loading) return <LoadingView />;

  return (
    <ThemedView style={styles.flex}>
      {loadError ? (
        <EmptyState icon="alert-circle-outline" title={t('liked.loadFailed')} description={loadError} />
      ) : days.length === 0 ? (
        <EmptyState icon="heart-outline" title={t('liked.emptyTitle')} />
      ) : (
        <FlatList
          data={days}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <LikedDayRow item={item} borderColor={theme.line} onPress={() => router.push(`/day/${item.id}`)} />
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  row: {
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
    justifyContent: 'center',
    gap: 4,
  },
});
