import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { LoadingView } from '@/components/loading-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listLikedDays } from '@/data/days';
import { useLocale } from '@/hooks/use-locale';
import { useProtectedPhoto } from '@/hooks/use-protected-photo';
import { useTheme } from '@/hooks/use-theme';
import type { DayDoc } from '@/types/day';
import { formatDayLabelShort } from '@/utils/date';

function LikedDayRow({ item, borderColor, thumbColor, onPress }: {
  item: DayDoc;
  borderColor: string;
  thumbColor: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const cover = useProtectedPhoto(item.photoURLs[0]);
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderColor }]}>
      <View style={[styles.thumb, { backgroundColor: thumbColor }]}>
        {cover ? (
          <Image source={cover} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Ionicons name="image-outline" size={20} color={theme.muted} />
        )}
      </View>
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
          if (active) setLoadError(error?.message ?? t('common.unknownError'));
        })
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
      // t는 언어가 바뀔 때마다 새 함수 참조가 되는데, 여기 의존성에 넣으면
      // (네이티브에서) 언어를 바꿀 때마다 목록을 불필요하게 다시 통째로
      // 불러오게 된다 — 에러 메시지 번역 하나 때문에 감수할 비용이 아니라서
      // 뺀다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <LikedDayRow
              item={item}
              borderColor={theme.line}
              thumbColor={theme.card}
              onPress={() => router.push(`/day/${item.id}`)}
            />
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
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  textBlock: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
});
