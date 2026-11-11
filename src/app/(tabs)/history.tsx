import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { MoodFlowSummary } from '@/components/mood-flow-summary';
import { PersonFilterModal } from '@/components/person-filter-modal';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimelineCard } from '@/components/timeline-card';
import { UpdatedFriendsStrip, type UpdatedFriend } from '@/components/updated-friends-strip';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listFriends } from '@/data/friends';
import {
  listFriendDaysInMonth,
  listFriendDaysTimeline,
  listFriendUpdates,
  listMyDaysInMonth,
  listMyDaysTimelinePage,
  listMyDrafts,
} from '@/data/days';
import { getUserProfile, listFriendGroups } from '@/data/users';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { DayDoc } from '@/types/day';
import type { FriendEntry, FriendGroup, UserProfile } from '@/types/user';
import { loadSeenMap, markFriendHistorySeen } from '@/utils/friend-update-seen';
import {
  formatDayLabelShort,
  formatYearMonth,
  getMonthGrid,
  isFutureLabel,
  isWritableNow,
  nowAsKstWallClock,
  todayKstLabel,
  weekdayLabels,
} from '@/utils/date';

type ViewMode = 'calendar' | 'timeline';

export default function HistoryScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user, profile } = useAuth();
  const params = useLocalSearchParams<{ friendUid?: string }>();
  // route param으로 친구 uid가 넘어오면 "내 연혁"이 아니라 그 친구의 연혁을
  // 보는 화면으로 동작한다 — 아래 selectedFriendUid(내 연혁 안에서 태그로
  // 거르는 필터)와는 완전히 별개 개념이다.
  const viewingFriendUid = params.friendUid ?? null;
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');

  const now = nowAsKstWallClock();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);

  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [selectedFriendUid, setSelectedFriendUid] = useState<string | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [monthDays, setMonthDays] = useState<DayDoc[]>([]);
  const [timelineDays, setTimelineDays] = useState<DayDoc[]>([]);
  const [drafts, setDrafts] = useState<DayDoc[]>([]);
  const [updatedFriends, setUpdatedFriends] = useState<UpdatedFriend[]>([]);
  const [viewedProfile, setViewedProfile] = useState<UserProfile | null>(null);
  const [selectedDateLabel, setSelectedDateLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 타임라인 "더보기" — 예전엔 최근 TIMELINE_PAGE_SIZE(구 50)개만 가져오고
  // 그 이상은 볼 방법이 아예 없었다. 내 연혁은 date 커서로 진짜 다음
  // 페이지만 더 읽어오고, 친구 연혁은(공개범위별로 쿼리 두 개를 합치는
  // 구조라 커서 관리가 더 번거로워) 지금 당장은 "가져오는 개수를 늘려서
  // 다시 조회"하는 단순한 방식으로 최소한 "50개 넘으면 아예 못 봄" 문제만
  // 없앴다.
  const TIMELINE_PAGE_SIZE = 20;
  const [timelineCursor, setTimelineCursor] = useState<number | null>(null);
  const [timelineHasMore, setTimelineHasMore] = useState(false);
  const [friendTimelineLimit, setFriendTimelineLimit] = useState(TIMELINE_PAGE_SIZE);
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false);

  // 친구 탭/프로필에서 "연혁 보기"로 들어오면 달력보다 타임라인이 더
  // 자연스럽다. 탭은 마운트된 채 유지되므로 초기 state만으로는 이후의
  // 재진입(다른 친구 클릭)을 반영할 수 없어 effect로 반영한다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (viewingFriendUid) {
      setViewMode('timeline');
    }
  }, [viewingFriendUid]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const load = useCallback(async () => {
    if (!user) return;
    if (viewingFriendUid) {
      // 친구의 연혁을 볼 때는 그 친구가 실제로 올린 DAY를(공개범위 안에서)
      // 가져온다 — 예전엔 실수로 내 자신의 DAY를 태그 기준으로만 걸러서
      // 보여줬었다.
      setFriendTimelineLimit(TIMELINE_PAGE_SIZE);
      const [viewedUserProfile, monthList, timeline] = await Promise.all([
        getUserProfile(viewingFriendUid),
        listFriendDaysInMonth(user.uid, viewingFriendUid, year, month),
        listFriendDaysTimeline(user.uid, viewingFriendUid, TIMELINE_PAGE_SIZE),
      ]);
      setViewedProfile(viewedUserProfile);
      setMonthDays(monthList);
      setTimelineDays(timeline);
      setDrafts([]);
      // 이 친구의 연혁을 열어봤으니 "업데이트한 친구"의 새 소식 점을 지운다.
      await markFriendHistorySeen(user.uid, viewingFriendUid);
      return;
    }
    const [friendList, groupList, monthList, timelinePage, draftList] = await Promise.all([
      listFriends(user.uid),
      listFriendGroups(user.uid),
      listMyDaysInMonth(user.uid, year, month),
      listMyDaysTimelinePage(user.uid, TIMELINE_PAGE_SIZE),
      listMyDrafts(user.uid),
    ]);
    setFriends(friendList);
    setGroups(groupList);
    setMonthDays(monthList);
    setTimelineDays(timelinePage.days);
    setTimelineCursor(timelinePage.nextCursor);
    setTimelineHasMore(!!timelinePage.nextCursor);
    setDrafts(draftList);

    // 최근 연혁에 새 DAY를 올린 친구들(업데이트한 친구). 실패해도 내 연혁은
    // 그대로 보여야 하니 따로 잡는다.
    try {
      const [updates, seen] = await Promise.all([
        listFriendUpdates(friendList.map((f) => f.friendUid)),
        loadSeenMap(user.uid),
      ]);
      const byUid = new Map(friendList.map((f) => [f.friendUid, f]));
      setUpdatedFriends(
        updates
          .filter((u) => byUid.has(u.uid))
          .map((u) => {
            const f = byUid.get(u.uid)!;
            return { uid: u.uid, nickname: f.nickname, photoURL: f.photoURL, latestMs: u.latestMs, unseen: u.latestMs > (seen[u.uid] ?? 0) };
          })
      );
    } catch (error) {
      console.error('업데이트한 친구를 불러오지 못했어요', error);
    }
  }, [user, year, month, viewingFriendUid]);

  function openFriendHistory(friendUid: string) {
    setUpdatedFriends((prev) => prev.map((f) => (f.uid === friendUid ? { ...f, unseen: false } : f)));
    router.push({ pathname: '/(tabs)/history', params: { friendUid } });
  }

  async function loadMoreTimeline() {
    if (!user || loadingMoreTimeline) return;
    setLoadingMoreTimeline(true);
    try {
      if (viewingFriendUid) {
        const nextLimit = friendTimelineLimit + TIMELINE_PAGE_SIZE;
        const timeline = await listFriendDaysTimeline(user.uid, viewingFriendUid, nextLimit);
        setTimelineDays(timeline);
        setFriendTimelineLimit(nextLimit);
      } else {
        const page = await listMyDaysTimelinePage(
          user.uid,
          TIMELINE_PAGE_SIZE,
          timelineCursor,
          timelineDays.map((d) => d.id)
        );
        setTimelineDays((prev) => [...prev, ...page.days]);
        setTimelineCursor(page.nextCursor);
        setTimelineHasMore(!!page.nextCursor);
      }
    } catch {
      // 더보기 실패는 조용히 넘어간다 — 이미 보여준 목록은 그대로 유지되고,
      // 버튼을 다시 누르면 재시도된다.
    } finally {
      setLoadingMoreTimeline(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setLoadError(null);
      load()
        .catch((error) => {
          console.error('연혁을 불러오지 못했어요', error);
          if (active) setLoadError(error?.message ?? t('common.unknownError'));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
      // t는 언어가 바뀔 때마다 새 함수 참조가 되는데, 여기 의존성에 넣으면
      // (네이티브에서) 언어를 바꿀 때마다 연혁을 불필요하게 다시 통째로
      // 불러오게 된다 — 에러 메시지 번역 하나 때문에 감수할 비용이 아니라서
      // 뺀다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await load();
      setLoadError(null);
    } catch (error) {
      console.error('연혁을 불러오지 못했어요', error);
      setLoadError((error as { message?: string })?.message ?? t('common.unknownError'));
    } finally {
      setRefreshing(false);
    }
  }

  const selectedFriendNickname = useMemo(
    () => friends.find((f) => f.friendUid === selectedFriendUid)?.nickname ?? null,
    [friends, selectedFriendUid]
  );

  // 친구 연혁 보기 모드에서는 monthDays/timelineDays가 이미 그 친구의 DAY로
  // 정확히 좁혀져 있으니 추가 필터가 필요 없다 — "함께한 사람" 태그 필터는
  // 내 연혁을 볼 때만 의미가 있다.
  const filteredMonthDays = useMemo(
    () => (!viewingFriendUid && selectedFriendUid ? monthDays.filter((d) => d.taggedFriendUids.includes(selectedFriendUid)) : monthDays),
    [monthDays, selectedFriendUid, viewingFriendUid]
  );

  const filteredTimeline = useMemo(
    () =>
      !viewingFriendUid && selectedFriendUid
        ? timelineDays.filter((d) => d.taggedFriendUids.includes(selectedFriendUid))
        : timelineDays,
    [timelineDays, selectedFriendUid, viewingFriendUid]
  );

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const daysWithEntryLabels = useMemo(() => new Set(filteredMonthDays.map((d) => d.dateLabel)), [filteredMonthDays]);
  const todayLabel = todayKstLabel();
  const selectedEntries = useMemo(
    () => (selectedDateLabel ? filteredMonthDays.filter((d) => d.dateLabel === selectedDateLabel) : []),
    [filteredMonthDays, selectedDateLabel]
  );

  function goToMonth(delta: number) {
    setSelectedDateLabel(null);
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setMonth(nextMonth);
    setYear(nextYear);
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}>
          {viewingFriendUid && (
            <Pressable onPress={() => router.replace('/(tabs)/history')} style={styles.backToMineRow} hitSlop={8}>
              <Ionicons name="chevron-back" size={16} color={theme.sub} />
              <ThemedText type="caption" color="sub">
                {t('history.backToMine')}
              </ThemedText>
            </Pressable>
          )}

          <View style={styles.headerRow}>
            <View style={styles.headerTitleBlock}>
              <ThemedText type="title">
                {viewingFriendUid ? `${viewedProfile?.nickname ?? '...'}${t('history.friendTitleSuffix')}` : t('history.myTitle')}
              </ThemedText>
              <ThemedText type="caption" color="sub">
                {t('history.dayCount', { count: (viewingFriendUid ? viewedProfile?.dayCount : profile?.dayCount) ?? 0 })}
              </ThemedText>
            </View>
            <Pressable onPress={handleRefresh} disabled={refreshing} hitSlop={8}>
              {refreshing ? (
                <ActivityIndicator size="small" color={theme.sub} />
              ) : (
                <Ionicons name="refresh-outline" size={21} color={theme.sub} />
              )}
            </Pressable>
          </View>

          {loadError && (
            <ThemedView surface="card" style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
              <ThemedText type="caption" color="danger" style={styles.errorText}>
                {t('common.loadErrorBanner', { message: loadError })}
              </ThemedText>
            </ThemedView>
          )}

          {!viewingFriendUid && <UpdatedFriendsStrip friends={updatedFriends} onPress={openFriendHistory} />}

          {!viewingFriendUid && drafts.length > 0 && (
            <View style={styles.draftsSection}>
              <ThemedText type="label" color="sub">
                {t('history.drafts')}
              </ThemedText>
              {drafts.map((d) => {
                const expired = !isFutureLabel(d.dateLabel) && !isWritableNow(d.dateLabel);
                const dueToday = !isFutureLabel(d.dateLabel) && isWritableNow(d.dateLabel);
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => router.push(`/day/${d.id}`)}
                    style={[styles.draftRow, { borderColor: theme.line, backgroundColor: theme.surface }]}>
                    <ThemedText type="body" numberOfLines={1} style={styles.draftRowTitle}>
                      {d.title}
                    </ThemedText>
                    <ThemedText type="caption" color={expired ? 'danger' : dueToday ? 'accentInk' : 'muted'}>
                      {expired ? t('history.draftExpired') : dueToday ? t('history.draftDueToday') : formatDayLabelShort(d.dateLabel)}
                    </ThemedText>
                    <Ionicons name="chevron-forward" size={16} color={theme.muted} />
                  </Pressable>
                );
              })}
            </View>
          )}

          <Segmented
            value={viewMode}
            onChange={setViewMode}
            options={[
              { key: 'calendar', label: t('history.calendarView') },
              { key: 'timeline', label: t('history.timelineView') },
            ]}
          />

          {!viewingFriendUid && (
            <>
              <View style={styles.filterRow}>
                <Pressable
                  style={[styles.filterButton, { backgroundColor: theme.card }]}
                  onPress={() => setFilterModalOpen(true)}>
                  <Ionicons name="funnel-outline" size={14} color={theme.sub} />
                  <ThemedText type="caption" color="sub" numberOfLines={1} style={styles.filterButtonText}>
                    {selectedFriendNickname ?? t('history.filterAll')}
                  </ThemedText>
                  <Ionicons name="chevron-down" size={14} color={theme.muted} />
                </Pressable>
                {selectedFriendUid !== null && (
                  <Pressable onPress={() => setSelectedFriendUid(null)} hitSlop={8} style={styles.filterClear}>
                    <Ionicons name="close-circle" size={18} color={theme.muted} />
                  </Pressable>
                )}
              </View>

              <PersonFilterModal
                visible={filterModalOpen}
                friends={friends}
                groups={groups}
                selectedUid={selectedFriendUid}
                onSelect={setSelectedFriendUid}
                onClose={() => setFilterModalOpen(false)}
              />
            </>
          )}

          {viewMode === 'calendar' ? (
            <View style={styles.calendarBlock}>
              <View style={styles.monthNav}>
                <Pressable onPress={() => goToMonth(-1)} hitSlop={8}>
                  <Ionicons name="chevron-back" size={18} color={theme.sub} />
                </Pressable>
                <ThemedText type="label">{formatYearMonth(year, month)}</ThemedText>
                <Pressable onPress={() => goToMonth(1)} hitSlop={8}>
                  <Ionicons name="chevron-forward" size={18} color={theme.sub} />
                </Pressable>
              </View>

              <View style={styles.weekdayRow}>
                {weekdayLabels().map((w) => (
                  <ThemedText key={w} type="caption" color="muted" style={styles.weekdayCell}>
                    {w}
                  </ThemedText>
                ))}
              </View>

              <View style={styles.grid}>
                {grid.map((cell, index) => {
                  if (!cell.label) {
                    return <View key={index} style={styles.dayCell} />;
                  }
                  const hasEntry = daysWithEntryLabels.has(cell.label);
                  const isToday = cell.label === todayLabel;
                  const isSelected = cell.label === selectedDateLabel;
                  return (
                    <Pressable
                      key={cell.label}
                      onPress={() => setSelectedDateLabel(hasEntry ? cell.label : null)}
                      style={[
                        styles.dayCell,
                        isToday && { backgroundColor: theme.accentSoft },
                        isSelected && { borderWidth: 1.5, borderColor: theme.accent },
                      ]}>
                      <ThemedText type="caption" color={isToday ? 'accentInk' : 'ink'}>
                        {cell.day}
                      </ThemedText>
                      {hasEntry && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
                    </Pressable>
                  );
                })}
              </View>

              {!loading && (
                <View style={styles.moodFlowWrap}>
                  <MoodFlowSummary days={filteredMonthDays} />
                </View>
              )}

              {selectedDateLabel && (
                <View style={styles.selectedList}>
                  {selectedEntries.map((entry) => (
                    <Pressable
                      key={entry.id}
                      onPress={() => router.push(`/day/${entry.id}`)}
                      style={[styles.selectedRow, { borderColor: theme.line, backgroundColor: theme.surface }]}>
                      <ThemedText type="label" numberOfLines={1} style={styles.selectedTitle}>
                        {entry.title}
                      </ThemedText>
                      <Ionicons name="chevron-forward" size={16} color={theme.muted} />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.timelineBlock}>
              {!loading && filteredTimeline.length > 0 && (
                <View style={styles.moodFlowWrap}>
                  <MoodFlowSummary days={filteredTimeline} />
                </View>
              )}
              {!loading && filteredTimeline.length === 0 ? (
                <EmptyState
                  icon="book-outline"
                  title={viewingFriendUid ? t('history.emptyFriendTimelineTitle') : t('history.emptyMyTimelineTitle')}
                  description={viewingFriendUid ? undefined : t('history.emptyMyTimelineDescription')}
                />
              ) : (
                filteredTimeline.map((day, index) => (
                  <TimelineCard
                    key={day.id}
                    day={day}
                    isLast={index === filteredTimeline.length - 1}
                    onPress={() => router.push(`/day/${day.id}`)}
                  />
                ))
              )}
              {(viewingFriendUid ? timelineDays.length === friendTimelineLimit : timelineHasMore) && (
                <Pressable
                  onPress={loadMoreTimeline}
                  disabled={loadingMoreTimeline}
                  style={[styles.timelineMoreButton, { borderColor: theme.line }]}>
                  {loadingMoreTimeline ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <ThemedText type="caption" color="sub">
                      {t('common.loadMore')}
                    </ThemedText>
                  )}
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
    // 오른쪽 아래 글쓰기 버튼(FAB)에 마지막 줄이 가리지 않게 넉넉히 둔다.
    paddingBottom: Spacing.six + Spacing.five,
  },
  backToMineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  headerTitleBlock: {
    gap: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  errorText: {
    flex: 1,
  },
  draftsSection: {
    gap: Spacing.two,
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  draftRowTitle: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    maxWidth: 200,
  },
  filterButtonText: {
    flexShrink: 1,
  },
  filterClear: {
    padding: 2,
  },
  calendarBlock: {
    gap: Spacing.two,
  },
  moodFlowWrap: {
    marginTop: Spacing.two,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayCell: {
    flex: 1,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
    gap: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  selectedList: {
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  selectedTitle: {
    flex: 1,
  },
  timelineBlock: {
    marginTop: Spacing.two,
  },
  timelineMoreButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
});
