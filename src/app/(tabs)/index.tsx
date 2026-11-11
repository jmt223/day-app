import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DAY_CARD_ROW_GAP, DayCard } from '@/components/day-card';
import { DayListRow } from '@/components/day-list-row';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { officialDaysOn } from '@/constants/official-days';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listBlockedUidSet } from '@/data/blocks';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { listFriendsFeed, listMyDaysOn, listWorldDaysNew, listWorldDaysToday } from '@/data/days';
import { listFriends } from '@/data/friends';
import { countUnreadNotifications } from '@/data/notifications';
import type { DayDoc } from '@/types/day';
import { formatDayLabelKorean, relativeTimeFromNow, todayKstLabel } from '@/utils/date';

// 홈 화면은 "미리보기"만 보여준다 — 세 섹션 다 이 개수만큼만 가로로
// 보여주고, 그 이상은 "전체보기"로 넘어가서 본다(day-list.tsx). 예전엔
// "더보기"를 누를 때마다 이 값을 계속 늘려서 처음부터 다시 불러오고, 그
// 결과를 같은 가로 스크롤 한 줄에 계속 이어 붙였는데 — 사람이 늘고 DAY가
// 쌓일수록 매번 다시 불러오는 양도 커지고, 결국 한 줄을 옆으로 한없이
// 넘겨야 원하는 걸 찾는 구조라 오히려 갈수록 불편해지는 방식이었다.
const PREVIEW_SIZE = 10;

export default function WorldDayScreen() {
  const theme = useTheme();
  const { t, locale } = useLocale();
  const { user } = useAuth();
  // 오늘 날짜(KST)와 겹치는 공식 기념일. 매일 자정 KST 기준으로만 바뀌면
  // 되니 화면이 떠 있는 동안은 한 번만 계산해도 충분하다.
  const todaysOfficialDays = useMemo(() => {
    const [, month, day] = todayKstLabel().split('-').map(Number);
    return officialDaysOn(month, day);
  }, []);
  const [popularToday, setPopularToday] = useState<DayDoc[]>([]);
  const [newest, setNewest] = useState<DayDoc[]>([]);
  const [friendFeed, setFriendFeed] = useState<DayDoc[]>([]);
  // 오늘 날짜로 내가 남긴 DAY — 있으면 상단 "오늘은 어떤 DAY인가요?" 자리에
  // 그 DAY의 이름이 들어간다(여러 개면 가장 최근 것).
  const [myTodayDays, setMyTodayDays] = useState<DayDoc[]>([]);
  const [friendUids, setFriendUids] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (friends: string[]) => {
    if (!user) return;
    const [popular, recent, feed, blocked, mine] = await Promise.all([
      listWorldDaysToday(PREVIEW_SIZE),
      listWorldDaysNew(PREVIEW_SIZE),
      listFriendsFeed(friends, PREVIEW_SIZE),
      listBlockedUidSet(user.uid),
      listMyDaysOn(user.uid, todayKstLabel()),
    ]);
    setMyTodayDays(mine);
    // 차단한 사람의 글은 피드에서 걸러낸다(클라이언트 필터 — 서버 쿼리
    // 자체에서 "이 uid들 제외"를 못 하니 결과를 받은 뒤 뺀다).
    setPopularToday(popular.filter((d) => !blocked.has(d.authorId)));
    setNewest(recent.filter((d) => !blocked.has(d.authorId)));
    setFriendFeed(feed.filter((d) => !blocked.has(d.authorId)));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      setLoading(true);
      setLoadError(null);
      listFriends(user.uid)
        .then((friendList) => {
          if (!active) return null;
          const uids = friendList.map((f) => f.friendUid);
          setFriendUids(uids);
          return load(uids);
        })
        .catch((error) => {
          console.error('월드 데이를 불러오지 못했어요', error);
          if (active) setLoadError(error?.message ?? t('common.unknownError'));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
      // t는 언어가 바뀔 때마다 새 함수 참조가 되는데, 여기 의존성에 넣으면
      // (네이티브에서) 언어를 바꿀 때마다 이 화면에 있던 피드를 불필요하게
      // 다시 통째로 불러오게 된다 — 에러 메시지 번역 하나 때문에 감수할
      // 비용이 아니라서 뺀다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, user])
  );

  // 알림 화면에 다녀올 때마다(다른 탭 눌렀다 올 때 포함) 다시 세서 뱃지를
  // 최신 상태로 맞춘다 — 별도 effect라 위 데이터 로딩과는 무관하게 가볍게
  // 자주 돌아도 된다.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      countUnreadNotifications(user.uid)
        .then((count) => active && setUnreadCount(count))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [user])
  );

  async function onRefresh() {
    if (!user) return;
    setRefreshing(true);
    await load(friendUids)
      .then(() => setLoadError(null))
      .catch((error) => {
        console.error('월드 데이를 불러오지 못했어요', error);
        setLoadError(error?.message ?? t('common.unknownError'));
      });
    setRefreshing(false);
  }

  const myToday = myTodayDays[0] ?? null;

  function seeAllFriendFeed() {
    router.push({ pathname: '/day-list', params: { type: 'friends', title: t('main.friendFeed'), friendUids: JSON.stringify(friendUids) } });
  }
  function seeAllPopular() {
    router.push({ pathname: '/day-list', params: { type: 'popular', title: t('main.popularToday') } });
  }
  function seeAllNewest() {
    router.push({ pathname: '/day-list', params: { type: 'new', title: t('main.newest') } });
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}>
          <View style={styles.topBar}>
            <ThemedText type="title" style={styles.wordmark}>
              DAY
            </ThemedText>
            <View style={styles.topBarActions}>
              <Pressable onPress={onRefresh} disabled={refreshing} hitSlop={8}>
                {refreshing ? (
                  <ActivityIndicator size="small" color={theme.sub} />
                ) : (
                  <Ionicons name="refresh-outline" size={21} color={theme.sub} />
                )}
              </Pressable>
              <Pressable onPress={() => router.push('/notifications')} hitSlop={8} style={styles.bellButton}>
                <Ionicons name="notifications-outline" size={21} color={theme.sub} />
                {unreadCount > 0 && (
                  <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.surface }]}>
                    <ThemedText type="caption" style={styles.badgeText} numberOfLines={1}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </ThemedText>
                  </View>
                )}
              </Pressable>
              <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
                <Ionicons name="person-circle-outline" size={23} color={theme.sub} />
              </Pressable>
            </View>
          </View>

          {loadError && (
            <ThemedView surface="card" style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
              <ThemedText type="caption" color="danger" style={styles.errorText}>
                {t('common.loadErrorBanner', { message: loadError })}
              </ThemedText>
            </ThemedView>
          )}

          <Pressable
            disabled={!myToday}
            onPress={() => myToday && router.push(`/day/${myToday.id}`)}
            accessibilityRole={myToday ? 'button' : undefined}
            style={[styles.hero, { backgroundColor: theme.surface, shadowColor: theme.ink }]}>
            <ThemedText type="label" color="accentInk">
              {formatDayLabelKorean(todayKstLabel())}
            </ThemedText>
            {myToday ? (
              <>
                <ThemedText type="caption" color="sub">
                  {t('main.myTodayLabel')}
                </ThemedText>
                <ThemedText type="heading" numberOfLines={2}>
                  {myToday.title}
                </ThemedText>
                <View style={styles.heroLinkRow}>
                  <ThemedText type="caption" color="accentInk">
                    {myTodayDays.length > 1 ? t('main.myTodayMore', { count: myTodayDays.length }) : t('main.myTodayOpen')}
                  </ThemedText>
                  <Ionicons name="chevron-forward" size={13} color={theme.accentInk} />
                </View>
              </>
            ) : (
              <>
                <ThemedText type="heading">{t('main.today')}</ThemedText>
                <ThemedText type="caption" color="sub">
                  {t('main.todayHint')}
                </ThemedText>
              </>
            )}
            {todaysOfficialDays.length > 0 && (
              <View style={styles.officialDayRow}>
                {todaysOfficialDays.map((d) => (
                  <View key={d.name} style={[styles.officialDayChip, { backgroundColor: theme.accentSoft }]}>
                    <ThemedText type="caption" color="accentInk">
                      {d.icon} {locale === 'ko' ? d.name : d.nameEn}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </Pressable>

          {friendUids.length > 0 && (
            <Section
              title={t('main.friendFeed')}
              loading={loading}
              empty={friendFeed.length === 0}
              emptyTitle={t('main.friendFeedEmptyTitle')}
              emptyDescription={t('main.friendFeedEmptyDescription')}
              onSeeAll={friendFeed.length > 0 ? seeAllFriendFeed : undefined}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={friendFeed}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.row}
                renderItem={({ item }) => (
                  <DayCard
                    day={item}
                    meta={`${item.authorNickname} · ${relativeTimeFromNow(item.createdAt)}`}
                    onPress={() => router.push(`/day/${item.id}`)}
                  />
                )}
              />
            </Section>
          )}

          <Section
            title={t('main.popularToday')}
            loading={loading}
            empty={popularToday.length === 0}
            emptyTitle={t('main.emptyTitle')}
            emptyDescription={t('main.emptyDescription')}
            onSeeAll={popularToday.length > 0 ? seeAllPopular : undefined}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={popularToday}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.row}
              renderItem={({ item }) => (
                <DayCard
                  day={item}
                  meta={`${item.authorNickname} · ${relativeTimeFromNow(item.createdAt)}`}
                  onPress={() => router.push(`/day/${item.id}`)}
                />
              )}
            />
          </Section>

          <Section
            title={t('main.newest')}
            loading={loading}
            empty={newest.length === 0}
            emptyTitle={t('main.emptyTitle')}
            emptyDescription={t('main.emptyDescription')}
            onSeeAll={newest.length > 0 ? seeAllNewest : undefined}>
            <View style={[styles.board, { backgroundColor: theme.surface, borderColor: theme.line }]}>
              {newest.map((item, index) => (
                <DayListRow
                  key={item.id}
                  day={item}
                  isLast={index === newest.length - 1}
                  onPress={() => router.push(`/day/${item.id}`)}
                />
              ))}
            </View>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({
  title,
  loading,
  empty,
  emptyTitle,
  emptyDescription,
  onSeeAll,
  children,
}: {
  title: string;
  loading: boolean;
  empty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  onSeeAll?: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const { t } = useLocale();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText type="label" style={styles.sectionTitle}>
          {title}
        </ThemedText>
        {onSeeAll && (
          <Pressable onPress={onSeeAll} hitSlop={8} style={styles.seeAllButton}>
            <ThemedText type="caption" color="sub">
              {t('main.seeAll')}
            </ThemedText>
            <Ionicons name="chevron-forward" size={14} color={theme.muted} />
          </Pressable>
        )}
      </View>
      {!loading && empty ? (
        <EmptyState icon="sunny-outline" title={emptyTitle} description={emptyDescription} />
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    // 오른쪽 아래 글쓰기 버튼(FAB)에 마지막 줄이 가리지 않게 넉넉히 둔다.
    paddingBottom: Spacing.six + Spacing.five,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  bellButton: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    lineHeight: 11,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  errorText: {
    flex: 1,
  },
  wordmark: {
    letterSpacing: 1,
  },
  hero: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    marginBottom: Spacing.five,
    padding: Spacing.four,
    borderRadius: Radius.large,
    gap: Spacing.one,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  heroLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  board: {
    marginHorizontal: Spacing.four,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  officialDayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  officialDayChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  section: {
    gap: Spacing.two,
    marginBottom: Spacing.five,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
  },
  sectionTitle: {},
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  row: {
    gap: DAY_CARD_ROW_GAP,
    paddingHorizontal: Spacing.four,
  },
});
