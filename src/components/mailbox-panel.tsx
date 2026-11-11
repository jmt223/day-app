import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { LoadingView } from '@/components/loading-view';
import { PetAvatar } from '@/components/pet-avatar';
import { PrimaryButton } from '@/components/primary-button';
import { SummonAcceptSheet } from '@/components/summon-accept-sheet';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listConversations, type ConversationSummary } from '@/data/letters';
import { listUnreadLetterSenders, markLetterNotificationsReadFrom } from '@/data/notifications';
import { listIncomingSummons, type IncomingSummon } from '@/data/summons';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { LetterDoc } from '@/types/letter';
import { relativeTimeFromNow } from '@/utils/date';
import { petName } from '@/utils/josa';
import { maskedText } from '@/utils/letter-damage';
import { formatCountdown, petIsOverstaying, petIsWaiting, replyDeadlineMs } from '@/utils/letters';

/** 대화방 목록 한 줄에 보여줄 가장 최근 메시지. 손상은 받는 쪽에서만 보인다. */
function previewText(letter: LetterDoc, myUid: string, t: ReturnType<typeof useLocale>['t']): string {
  const mine = letter.fromUid === myUid;
  const replyIsLatest = !!letter.reply && (letter.reply.createdAt?.toMillis() ?? 0) >= (letter.createdAt?.toMillis() ?? 0);
  if (letter.reply && replyIsLatest) {
    // 답장은 원래 보낸 사람(fromUid)이 받는다.
    return mine
      ? maskedText(letter.reply.body, letter.reply.damageCells)
      : t('letters.previewMine', { text: letter.reply.body });
  }
  if (letter.kind === 'summon_response') {
    return mine
      ? t('letters.previewSummonSent', { pet: petName(letter.fromPetName, '을/를') })
      : t('letters.previewSummonArrived', { pet: petName(letter.fromPetName) });
  }
  return mine ? t('letters.previewMine', { text: letter.body }) : maskedText(letter.body, letter.outboundDamageCells);
}

export function MailboxPanel() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [summons, setSummons] = useState<IncomingSummon[]>([]);
  const [unreadFrom, setUnreadFrom] = useState<Set<string>>(new Set());
  const [hiddenSummons, setHiddenSummons] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState<IncomingSummon | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!user) return;
    const [list, incoming, unread] = await Promise.all([
      listConversations(user.uid),
      listIncomingSummons(user.uid),
      listUnreadLetterSenders(user.uid),
    ]);
    setConversations(list);
    setSummons(incoming);
    setUnreadFrom(unread);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load().catch((error) => {
        console.error('편지함을 불러오지 못했어요', error);
        setConversations((prev) => prev ?? []);
      });
    }, [load])
  );

  // 펫이 기다리는 대화방은 남은 시간이 흐르게 한다.
  const anyWaiting = (conversations ?? []).some((c) => c.theirWaiting || c.myWaiting);
  useEffect(() => {
    if (!anyWaiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [anyWaiting]);

  async function handleRefresh() {
    setRefreshing(true);
    await load().catch(() => undefined);
    setRefreshing(false);
  }

  if (!user || conversations === null) return <LoadingView />;

  const visibleSummons = summons.filter((s) => !hiddenSummons.has(s.fromUid));

  function hideSummon(summon: IncomingSummon) {
    setHiddenSummons((prev) => new Set(prev).add(summon.fromUid));
    if (user) markLetterNotificationsReadFrom(user.uid, summon.fromUid).catch(() => undefined);
  }

  const header = (
    <View style={styles.summons}>
      {visibleSummons.map((summon) => (
        <View key={summon.fromUid} style={[styles.summonCard, { backgroundColor: theme.surface, borderColor: theme.leaf }]}>
          <Avatar uri={summon.fromPhotoURL} size={40} />
          <View style={styles.summonText}>
            <ThemedText type="label">🐾 {t('letters.summon.cardTitle')}</ThemedText>
            <ThemedText type="caption" color="sub">
              {t('letters.summon.cardMessage', { nickname: summon.fromNickname })}
            </ThemedText>
            <View style={styles.summonActions}>
              <Pressable onPress={() => hideSummon(summon)} style={[styles.summonButton, { borderColor: theme.line }]}>
                <ThemedText type="caption" color="sub">
                  {t('letters.summon.later')}
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => setAccepting(summon)} style={[styles.summonButton, { backgroundColor: theme.leaf, borderColor: theme.leaf }]}>
                <ThemedText type="caption" color="onLeaf" style={styles.bold}>
                  {t('letters.summon.send')}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.otherUid}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <EmptyState icon="mail-outline" title={t('letters.emptyTitle')} description={t('letters.emptyDescription')} />
            <PrimaryButton tone="leaf" label={t('letters.writeToFriend')} onPress={() => router.push('/letters/compose')} />
          </View>
        }
        renderItem={({ item }) => {
          const theirs = item.theirWaiting && petIsWaiting(item.theirWaiting, now) ? item.theirWaiting : null;
          const mine = item.myWaiting && petIsWaiting(item.myWaiting, now) ? item.myWaiting : null;
          const unread = unreadFrom.has(item.otherUid);
          return (
            <Pressable
              style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.line }]}
              onPress={() => router.push(`/letters/with/${item.otherUid}`)}>
              <Avatar uri={item.photoURL} size={46} />
              <View style={styles.rowText}>
                <View style={styles.rowTop}>
                  <ThemedText type="label" numberOfLines={1} style={styles.flexShrink}>
                    {item.nickname}
                  </ThemedText>
                  <ThemedText type="caption" color="muted">
                    {relativeTimeFromNow(item.latest.reply?.createdAt ?? item.latest.createdAt)}
                  </ThemedText>
                </View>
                <ThemedText type="caption" color={unread ? 'ink' : 'sub'} numberOfLines={1}>
                  {previewText(item.latest, user.uid, t)}
                </ThemedText>
                {(theirs || mine) && (
                  <View style={styles.chips}>
                    {theirs && <WaitingChip letter={theirs} now={now} label={t('letters.chipTheirPet', { pet: petName(theirs.fromPetName) })} />}
                    {mine && <WaitingChip letter={mine} now={now} label={t('letters.chipMyPet', { pet: petName(mine.fromPetName) })} />}
                  </View>
                )}
              </View>
              {unread && <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />}
            </Pressable>
          );
        }}
      />

      <SummonAcceptSheet
        summoner={accepting ? { uid: accepting.fromUid, nickname: accepting.fromNickname, photoURL: accepting.fromPhotoURL } : null}
        onClose={() => setAccepting(null)}
        onSent={() => {
          const summoner = accepting;
          setAccepting(null);
          if (summoner) {
            hideSummon(summoner);
            router.push(`/letters/with/${summoner.fromUid}`);
          }
        }}
      />
    </>
  );
}

function WaitingChip({ letter, now, label }: { letter: LetterDoc; now: number; label: string }) {
  const theme = useTheme();
  const { t } = useLocale();
  const deadline = replyDeadlineMs(letter);
  const time = petIsOverstaying(letter, now) ? t('letters.overstaying') : deadline !== null ? formatCountdown(deadline - now) : '';
  return (
    <View style={[styles.chip, { backgroundColor: theme.leafSoft }]}>
      <PetAvatar species={letter.fromPetSpecies} size={16} />
      <ThemedText type="caption" color="leaf" numberOfLines={1}>
        {label}
        {time ? ` · ${time}` : ''}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: Spacing.four,
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  summons: {
    gap: Spacing.two,
  },
  summonCard: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1.5,
    marginBottom: Spacing.one,
  },
  summonText: {
    flex: 1,
    gap: 4,
  },
  summonActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  summonButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  bold: {
    fontWeight: '700',
  },
  empty: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  flexShrink: {
    flexShrink: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    maxWidth: '100%',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
