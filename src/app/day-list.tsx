import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayListRow } from '@/components/day-list-row';
import { EmptyState } from '@/components/empty-state';
import { LoadingView } from '@/components/loading-view';
import { TimelineCard } from '@/components/timeline-card';
import { Radius, Spacing } from '@/constants/theme';
import {
  listFriendsFeedPage,
  listWorldDaysNewPage,
  listWorldDaysTodayPage,
  type DayListPage,
  type FriendFeedCursor,
} from '@/data/days';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { DayDoc } from '@/types/day';
import { friendlyErrorMessage } from '@/utils/error-message';

const PAGE_SIZE = 20;

type ListType = 'popular' | 'new' | 'friends';

/**
 * 월드 데이 화면의 "더보기"를 누르면 오는 전체 목록 화면. 원래는 홈
 * 화면의 가로 스크롤 안에서 항목만 계속 늘려가는 방식이었는데, 사람이
 * 늘고 DAY가 쌓일수록 "가로로 계속 넘겨서 찾아야" 하는 구조라 오히려
 * 더 불편해진다 — 세로 목록 + 스크롤 끝에서 다음 페이지만 딱 불러오는
 * 방식으로 바꿨다.
 */
export default function DayListScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const navigation = useNavigation();
  const { type, title, friendUids: friendUidsParam } = useLocalSearchParams<{
    type: ListType;
    title: string;
    friendUids?: string;
  }>();

  const friendUids = friendUidsParam ? (JSON.parse(friendUidsParam) as string[]) : [];

  useLayoutEffect(() => {
    navigation.setOptions({ title: title ?? '' });
  }, [navigation, title]);

  const [days, setDays] = useState<DayDoc[]>([]);
  const [cursor, setCursor] = useState<number | FriendFeedCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (pageCursor: number | FriendFeedCursor | null): Promise<DayListPage | { days: DayDoc[]; nextCursor: FriendFeedCursor | null }> => {
      if (type === 'popular') return listWorldDaysTodayPage(PAGE_SIZE, pageCursor as number | null);
      if (type === 'friends') return listFriendsFeedPage(friendUids, PAGE_SIZE, pageCursor as FriendFeedCursor | null);
      return listWorldDaysNewPage(PAGE_SIZE, pageCursor as number | null);
    },
    // friendUids는 매 렌더 새 배열 참조가 되지만 실제 값은 화면 진입 시
    // 고정된 route param에서만 오므로, 문자열 형태인 friendUidsParam을
    // 대신 의존성으로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, friendUidsParam]
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 화면 진입 시
       첫 페이지를 불러오는 초기 로딩이라 로딩 상태를 즉시 켜야 한다. */
    let active = true;
    setLoading(true);
    setLoadError(null);
    fetchPage(null)
      .then((page) => {
        if (!active) return;
        setDays(page.days);
        setCursor(page.nextCursor);
        setHasMore(!!page.nextCursor);
      })
      .catch((error) => {
        console.error('목록을 불러오지 못했어요', error);
        if (active) setLoadError(friendlyErrorMessage(error));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      setDays((prev) => [...prev, ...page.days]);
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor);
    } catch (error) {
      console.error('다음 페이지를 불러오지 못했어요', error);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <LoadingView />;

  return (
    <SafeAreaView style={styles.flex} edges={['bottom']}>
      {loadError ? (
        <EmptyState icon="alert-circle-outline" title={t('common.loadErrorTitle')} description={loadError} />
      ) : days.length === 0 ? (
        <EmptyState icon="sunny-outline" title={t('main.emptyTitle')} description={t('main.emptyDescription')} />
      ) : (
        <FlatList
          data={days}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) =>
            // "새로운 DAY"는 홈과 같은 게시판형 목록(제목 [댓글수])으로 보여준다.
            type === 'new' ? (
              <View
                style={[
                  { backgroundColor: theme.surface },
                  index === 0 && styles.boardTop,
                  index === days.length - 1 && styles.boardBottom,
                ]}>
                <DayListRow day={item} isLast={index === days.length - 1} onPress={() => router.push(`/day/${item.id}`)} />
              </View>
            ) : (
              <TimelineCard day={item} isLast={index === days.length - 1} onPress={() => router.push(`/day/${item.id}`)} />
            )
          }
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  boardTop: {
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
  },
  boardBottom: {
    borderBottomLeftRadius: Radius.large,
    borderBottomRightRadius: Radius.large,
  },
  footer: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
});
