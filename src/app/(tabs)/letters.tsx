import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { IncomingSummonsBanner } from '@/components/incoming-summons-banner';
import { LoadingView } from '@/components/loading-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listReceivedLettersPage, listSentLettersPage, type LettersPage } from '@/data/letters';
import { markLetterNotificationsRead } from '@/data/notifications';
import { ensureStarterPet } from '@/data/pets';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { LetterDoc, LetterStatus } from '@/types/letter';
import { maskLetterBody } from '@/utils/letter-damage';
import { relativeTimeFromNow } from '@/utils/date';

const PAGE_SIZE = 20;

function statusLabel(status: LetterStatus, t: ReturnType<typeof useLocale>['t']): string {
  switch (status) {
    case 'awaiting_reply':
      return t('letters.statusAwaitingReply');
    case 'replied':
      return t('letters.statusReplied');
    case 'expired':
      return t('letters.statusExpired');
  }
}

export default function LettersScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user, profile, refreshProfile } = useAuth();
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const [letters, setLetters] = useState<LetterDoc[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    (uid: string, cursorMs?: number | null): Promise<LettersPage> =>
      tab === 'received' ? listReceivedLettersPage(uid, PAGE_SIZE, cursorMs) : listSentLettersPage(uid, PAGE_SIZE, cursorMs),
    [tab]
  );

  // 편지함 탭이 이 기능 이전 가입자에게도 "펫이 있어야 의미 있는" 첫
  // 화면일 수 있어서(pets.tsx를 아직 한 번도 안 열어봤어도), 여기서도
  // 지연 지급을 한 번 확인한다 — 그래야 이 사람이 바로 편지 쓰기로 들어가도
  // "펫이 모두 배달 중"이라는 엉뚱한 안내 대신 실제로 쓸 수 있는 펫이 있다.
  useFocusEffect(
    useCallback(() => {
      if (!user || !profile) return;
      if (!profile.petCount) {
        ensureStarterPet(user.uid, profile)
          .then((granted) => {
            if (granted) return refreshProfile();
          })
          .catch(() => undefined);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, profile?.petCount])
  );

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      setLoading(true);
      fetchPage(user.uid)
        .then((page) => {
          if (!active) return;
          setLetters(page.letters);
          setCursor(page.nextCursor);
          setHasMore(!!page.nextCursor);
        })
        .catch((error) => console.error('편지함을 불러오지 못했어요', error))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [user, fetchPage])
  );

  // 편지함 탭을 열어본 것 자체를 "확인했다"는 신호로 보고 배지를 지운다.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      markLetterNotificationsRead(user.uid).catch(() => undefined);
    }, [user])
  );

  async function loadMore() {
    if (!user || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(user.uid, cursor);
      setLetters((prev) => [...prev, ...page.letters]);
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor);
    } catch (error) {
      console.error('다음 편지를 불러오지 못했어요', error);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="title">{t('tabs.letters')}</ThemedText>
          <Pressable onPress={() => router.push('/letters/compose')} hitSlop={8}>
            <Ionicons name="create-outline" size={22} color={theme.accent} />
          </Pressable>
        </View>

        <IncomingSummonsBanner />

        <View style={[styles.tabRow, { borderColor: theme.line }]}>
          {(['received', 'sent'] as const).map((key) => (
            <Pressable key={key} style={styles.tabButton} onPress={() => setTab(key)}>
              <ThemedText type="label" color={tab === key ? 'ink' : 'muted'}>
                {key === 'received' ? t('letters.receivedTab') : t('letters.sentTab')}
              </ThemedText>
              {tab === key && <View style={[styles.tabUnderline, { backgroundColor: theme.accent }]} />}
            </Pressable>
          ))}
        </View>

        {loading ? (
          <LoadingView />
        ) : letters.length === 0 ? (
          <EmptyState
            icon="mail-outline"
            title={tab === 'received' ? t('letters.emptyReceivedTitle') : t('letters.emptySentTitle')}
          />
        ) : (
          <FlatList
            data={letters}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onEndReachedThreshold={0.4}
            onEndReached={loadMore}
            renderItem={({ item }) => {
              const otherNickname = tab === 'received' ? item.fromNickname : item.toNickname;
              const otherPhotoURL = tab === 'received' ? item.fromPhotoURL : item.toPhotoURL;
              // 손상은 "그걸 받는 쪽"에서만 보여야 한다 — 받은편지함(내가
              // toUid)에선 도착한 편지의 outboundDamage를, 보낸편지함(내가
              // fromUid)에선 내가 쓴 원문 대신 답장이 왔으면 그 답장의
              // damage를 본다. 내가 방금 쓴 원문 자체가 나한테 찢어져
              // 보이는 건 앞뒤가 안 맞는다(letters/[id].tsx와 같은 원칙).
              const masked =
                tab === 'received'
                  ? maskLetterBody(item.body, item.outboundDamage ?? 'none')
                  : item.replyPreview
                    ? {
                        text: t('letters.replyPreviewPrefix', {
                          reply: maskLetterBody(item.replyPreview.body, item.replyPreview.damage ?? 'none').text,
                        }),
                        note: maskLetterBody(item.replyPreview.body, item.replyPreview.damage ?? 'none').note,
                      }
                    : { text: item.body, note: null };
              return (
                <Pressable
                  style={[styles.row, { borderColor: theme.line }]}
                  onPress={() => router.push(`/letters/${item.id}`)}>
                  <Avatar uri={otherPhotoURL} size={44} />
                  <View style={styles.rowText}>
                    <ThemedText type="label" numberOfLines={1}>
                      {otherNickname}
                    </ThemedText>
                    <ThemedText type="caption" color="sub" numberOfLines={1}>
                      {masked.text || masked.note}
                    </ThemedText>
                    <ThemedText type="caption" color="muted">
                      {statusLabel(item.status, t)} · {relativeTimeFromNow(item.createdAt)}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            }}
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    marginTop: Spacing.three,
  },
  tabButton: {
    paddingVertical: Spacing.two,
    marginRight: Spacing.four,
    alignItems: 'center',
    gap: 6,
  },
  tabUnderline: {
    height: 2,
    width: '100%',
    borderRadius: 1,
  },
  list: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  footer: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
});
