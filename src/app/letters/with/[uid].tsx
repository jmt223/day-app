import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { DamagedText } from '@/components/damaged-text';
import { LoadingView } from '@/components/loading-view';
import { PetAvatar } from '@/components/pet-avatar';
import { SummonAcceptSheet } from '@/components/summon-accept-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WaitTimePicker } from '@/components/wait-time-picker';
import { DEFAULT_WAIT_MINUTES, speciesInfo, type WaitMinutes } from '@/constants/pets';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { isFriend } from '@/data/friends';
import { getLegacyReply, PetBusyError, sendLetter, submitReply, subscribeConversation } from '@/data/letters';
import { markLetterNotificationsReadFrom } from '@/data/notifications';
import { interactWithPet, PetActionError, reaskLetter, recallPet, subscribeMyPets } from '@/data/pets';
import { getPendingSummonFrom, sendSummon, type IncomingSummon } from '@/data/summons';
import { getUserProfile } from '@/data/users';
import { useDecorativeFonts } from '@/hooks/use-decorative-fonts';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { LetterDoc, LetterReplyCopy } from '@/types/letter';
import type { PetDoc } from '@/types/pet';
import type { UserProfile } from '@/types/user';
import { confirmAsync, notify } from '@/utils/confirm';
import { relativeTimeFromNow } from '@/utils/date';
import { petName } from '@/utils/josa';
import { isDamaged } from '@/utils/letter-damage';
import { formatCountdown, letterReadyForReply, petIsOverstaying, petIsWaiting, replyDeadlineMs } from '@/utils/letters';
import { randomPetReaction } from '@/utils/pet-reactions';

const BODY_MAX_LENGTH = 2000;

type TimelineItem =
  | { kind: 'letter'; key: string; at: number; letter: LetterDoc }
  | { kind: 'reply'; key: string; at: number; letter: LetterDoc; reply: LetterReplyCopy }
  | { kind: 'event'; key: string; at: number; letter: LetterDoc; text: string };

/**
 * 친구 한 명과의 편지 대화창. 내 펫에 메시지를 실어 보내면 상대 대화창에 바로
 * 도착하고(이동시간 없음), 펫은 고른 대기시간 동안 상대 곁에서 답장을 기다린다.
 * 상대 펫이 내 곁에 와 있으면 내 펫 없이 그 펫에 답장을 실어 보낼 수 있다.
 * 펫이 돌아가도 메시지는 그대로 남고, 대기 표시만 사라진다.
 */
export default function ConversationScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  // 말풍선 손글씨체(나눔손글씨 펜)는 이 화면에 들어올 때만 받는다.
  useDecorativeFonts();
  const navigation = useNavigation();
  const { uid: otherUid, focus } = useLocalSearchParams<{ uid: string; focus?: string }>();
  const { user, profile } = useAuth();

  const [other, setOther] = useState<UserProfile | null>(null);
  const [friend, setFriend] = useState<boolean | null>(null);
  const [letters, setLetters] = useState<LetterDoc[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [legacyReplies, setLegacyReplies] = useState<Record<string, LetterReplyCopy>>({});
  const [myPets, setMyPets] = useState<PetDoc[]>([]);
  const [pendingSummon, setPendingSummon] = useState<IncomingSummon | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [mode, setMode] = useState<'reply' | 'send'>('send');
  const [body, setBody] = useState('');
  const [petId, setPetId] = useState<string | null>(null);
  const [waitMinutes, setWaitMinutes] = useState<WaitMinutes>(DEFAULT_WAIT_MINUTES);
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [reaction, setReaction] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const myUid = user?.uid ?? '';

  useEffect(() => {
    if (!user || !otherUid) return;
    let active = true;
    Promise.all([getUserProfile(otherUid), isFriend(user.uid, otherUid), getPendingSummonFrom(user.uid, otherUid)])
      .then(([p, f, s]) => {
        if (!active) return;
        setOther(p);
        setFriend(f);
        setPendingSummon(s);
      })
      .catch((error) => console.error('대화 상대 정보를 불러오지 못했어요', error));
    return () => {
      active = false;
    };
  }, [user, otherUid]);

  useEffect(() => {
    if (!user || !otherUid) return;
    const unsubLetters = subscribeConversation(user.uid, otherUid, setLetters, (error) => {
      console.error('대화를 불러오지 못했어요', error);
      setLoadError(true);
    });
    const unsubPets = subscribeMyPets(user.uid, setMyPets);
    return () => {
      unsubLetters();
      unsubPets();
    };
  }, [user, otherUid]);

  // 이 대화창을 보고 있는 동안 도착한 편지 알림도 바로 읽음 처리한다.
  const letterCount = letters?.length ?? 0;
  const replyCount = letters?.filter((l) => l.reply).length ?? 0;
  useEffect(() => {
    if (!user || !otherUid) return;
    markLetterNotificationsReadFrom(user.uid, otherUid).catch(() => undefined);
  }, [user, otherUid, letterCount, replyCount]);

  // 개편 전 답장은 부모 편지에 사본이 없어서 서브문서를 직접 읽는다.
  useEffect(() => {
    if (!letters) return;
    const missing = letters.filter((l) => l.status === 'replied' && !l.reply && !legacyReplies[l.id]);
    if (missing.length === 0) return;
    Promise.all(missing.map((l) => getLegacyReply(l.id).catch(() => null))).then((replies) => {
      const next: Record<string, LetterReplyCopy> = {};
      missing.forEach((l, i) => {
        const r = replies[i];
        if (r) next[l.id] = { body: r.body, damage: r.damage, damageCells: r.damageCells, createdAt: r.createdAt };
      });
      if (Object.keys(next).length > 0) setLegacyReplies((prev) => ({ ...prev, ...next }));
    });
  }, [letters, legacyReplies]);

  const theirWaiting = useMemo(
    () => [...(letters ?? [])].reverse().find((l) => l.fromUid === otherUid && petIsWaiting(l, now)) ?? null,
    [letters, otherUid, now]
  );
  const myWaiting = useMemo(
    () => [...(letters ?? [])].reverse().find((l) => l.fromUid === myUid && petIsWaiting(l, now)) ?? null,
    [letters, myUid, now]
  );

  // 남은 시간을 1초마다 흐르게 한다(누구 펫이든 기다리는 중일 때만).
  const ticking = !!theirWaiting || !!myWaiting || (letters ?? []).some((l) => l.status === 'awaiting_reply');
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  // 상대 펫이 와 있으면 기본은 "답장" 모드, 펫이 떠나면 "내 펫으로 보내기"로.
  const theirWaitingId = theirWaiting?.id ?? null;
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMode(theirWaitingId ? 'reply' : 'send');
    setReaction(null);
  }, [theirWaitingId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const idlePets = myPets.filter((p) => p.status === 'idle');
  const selectedPet = idlePets.find((p) => p.id === petId) ?? idlePets[0] ?? null;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <Pressable
          style={styles.headerTitle}
          onPress={() => router.push({ pathname: '/profile', params: { uid: otherUid } })}
          accessibilityRole="button">
          <Avatar uri={other?.photoURL} size={28} />
          <ThemedText type="label" numberOfLines={1}>
            {other?.nickname ?? ''}
          </ThemedText>
        </Pressable>
      ),
    });
  }, [navigation, other, otherUid]);

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!letters) return [];
    const items: TimelineItem[] = [];
    for (const letter of letters) {
      const sentAt = letter.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      items.push({ kind: 'letter', key: `l-${letter.id}`, at: sentAt, letter });
      const reply = letter.reply ?? legacyReplies[letter.id];
      if (reply) {
        items.push({
          kind: 'reply',
          key: `r-${letter.id}`,
          at: reply.createdAt?.toMillis() ?? letter.repliedAt?.toMillis() ?? sentAt + 1,
          letter,
          reply,
        });
      }
      const pet = petName(letter.fromPetName);
      if (letter.status === 'expired' && !reply) {
        items.push({
          kind: 'event',
          key: `e-${letter.id}`,
          at: letter.expiredAt?.toMillis() ?? sentAt + 2,
          letter,
          text: letter.returnReason === 'early' ? t('letters.event.earlyReturn', { pet }) : t('letters.event.returned', { pet }),
        });
      } else if (letter.status === 'recalled') {
        items.push({ kind: 'event', key: `e-${letter.id}`, at: letter.recalledAt?.toMillis() ?? sentAt + 2, letter, text: t('letters.event.recalled', { pet }) });
      }
    }
    return items.sort((a, b) => a.at - b.at);
  }, [letters, legacyReplies, t]);

  if (!user || !profile || !otherUid) return <LoadingView />;
  if (loadError) {
    return (
      <ThemedView style={[styles.flex, styles.centered]}>
        <ThemedText type="body" color="sub">
          {t('letters.loadFailed')}
        </ThemedText>
      </ThemedView>
    );
  }
  if (!letters) return <LoadingView />;

  const otherNickname = other?.nickname ?? '';
  const canSendHere = friend !== false;

  async function handleSend() {
    if (!user || !otherUid || !selectedPet || !body.trim()) return;
    setSending(true);
    try {
      await sendLetter({ from: { uid: user.uid }, to: { uid: otherUid }, pet: selectedPet, body, waitMinutes });
      setBody('');
    } catch (error) {
      console.error('편지를 보내지 못했어요', error);
      notify(t('common.error'), error instanceof PetBusyError ? t('letters.compose.petBusyError') : t('letters.compose.sendFailed'));
    } finally {
      setSending(false);
    }
  }

  async function handleReply() {
    if (!theirWaiting || !body.trim()) return;
    setSending(true);
    try {
      await submitReply(theirWaiting.id, body);
      setBody('');
    } catch (error) {
      console.error('답장을 보내지 못했어요', error);
      notify(t('common.error'), t('letters.detail.replySendFailed'));
    } finally {
      setSending(false);
    }
  }

  async function handleRecall(letter: LetterDoc) {
    const ok = await confirmAsync(
      t('pets.recallConfirmTitle', { pet: petName(letter.fromPetName, '을/를') }),
      t('pets.recallConfirmMessage'),
      t('pets.recall')
    );
    if (!ok) return;
    setBusyAction('recall');
    try {
      await recallPet(letter.fromPetId);
    } catch (error) {
      notify(t('common.error'), error instanceof PetActionError && error.code === 'too-many-requests' ? t('users.tooManyRequests') : t('pets.recallFailed'));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleInteract(letter: LetterDoc, kind: 'pet' | 'snack') {
    setBusyAction(kind);
    try {
      await interactWithPet(letter.fromUid, letter.fromPetId, kind);
      setReaction(randomPetReaction(kind, letter.fromPetName));
    } catch (error) {
      const code = error instanceof PetActionError ? error.code : '';
      notify(
        t('common.error'),
        code === 'already-this-visit' ? t('letters.visit.alreadyThisVisit') : code === 'pet-not-visiting' ? t('letters.visit.petLeft') : t('pets.interactFailed')
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReask(letter: LetterDoc, part: 'outbound' | 'reply') {
    setBusyAction(`reask-${letter.id}-${part}`);
    try {
      await reaskLetter(letter.id, part);
      notify(t('letters.reask.sentTitle'), t('letters.reask.sentMessage', { nickname: otherNickname }));
    } catch (error) {
      const code = error instanceof PetActionError ? error.code : '';
      notify(t('common.error'), code === 'already-asked' ? t('letters.reask.alreadyAsked') : t('letters.reask.failed'));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSummon() {
    if (!user || !profile || !otherUid) return;
    setBusyAction('summon');
    try {
      await sendSummon({ uid: user.uid, nickname: profile.nickname, photoURL: profile.photoURL }, otherUid);
      notify(t('profile.summonSentTitle'), t('profile.summonSentMessage', { nickname: otherNickname }));
    } catch (error) {
      // 24시간 안에 이미 호출했으면 보안 규칙이 거부한다(permission-denied).
      const denied = (error as { code?: string })?.code === 'permission-denied';
      notify(t('common.error'), denied ? t('profile.summonCooldown') : t('profile.summonFailed'));
    } finally {
      setBusyAction(null);
    }
  }

  function prefillResend(text: string) {
    setMode('send');
    setBody(text);
  }

  function renderBubble(item: TimelineItem) {
    if (item.kind === 'event') {
      return (
        <View key={item.key} style={styles.eventRow}>
          <PetAvatar species={item.letter.fromPetSpecies} size={18} />
          <ThemedText type="caption" color="muted">
            {item.text}
          </ThemedText>
        </View>
      );
    }

    const { letter } = item;
    if (item.kind === 'letter' && letter.kind === 'summon_response') {
      const mine = letter.fromUid === myUid;
      return (
        <View key={item.key} style={styles.eventRow}>
          <PetAvatar species={letter.fromPetSpecies} size={18} />
          <ThemedText type="caption" color="leaf">
            {mine
              ? t('letters.event.summonSent', { pet: petName(letter.fromPetName), nickname: otherNickname })
              : t('letters.event.summonArrived', { nickname: otherNickname, pet: petName(letter.fromPetName, '을/를') })}
          </ThemedText>
        </View>
      );
    }

    // 편지는 보낸 사람(fromUid)이, 답장은 받은 사람(toUid)이 쓴 것이다. 어느 쪽이든
    // 그걸 나른 펫은 처음 편지를 보낸 사람의 펫이다.
    const isReply = item.kind === 'reply';
    const text = isReply ? item.reply.body : letter.body;
    const cells = isReply ? item.reply.damageCells : letter.outboundDamageCells;
    const writtenByMe = isReply ? letter.toUid === myUid : letter.fromUid === myUid;
    // 손상은 받는 쪽에서만 보인다 — 내가 쓴 글이 나한테 찢어져 보이면 앞뒤가 안 맞는다.
    const damagedForMe = !writtenByMe && isDamaged(cells);
    const part = isReply ? 'reply' : 'outbound';
    const reasked = isReply ? !!letter.replyReaskedAt : !!letter.outboundReaskedAt;
    const at = isReply ? item.reply.createdAt : letter.createdAt;
    const effect = speciesInfo(letter.fromPetSpecies).effect;
    const highlighted = !isReply && focus === letter.id;
    const pet = petName(letter.fromPetName);
    // "~에게"는 받침과 상관없는 조사라 이름을 그대로 넣는다.
    const carrier = isReply
      ? writtenByMe
        ? t('letters.carrier.replySent', { name: letter.fromPetName })
        : t('letters.carrier.replyArrived', { pet })
      : writtenByMe
        ? t('letters.carrier.sent', { name: letter.fromPetName })
        : t('letters.carrier.arrived', { pet });

    return (
      <View key={item.key} style={[styles.bubbleBlock, writtenByMe ? styles.alignEnd : styles.alignStart]}>
        <View style={[styles.carrierRow, writtenByMe && styles.rowReverse]}>
          <PetAvatar species={letter.fromPetSpecies} size={18} />
          <ThemedText type="caption" color="muted">
            {carrier}
          </ThemedText>
        </View>
        <View
          style={[
            styles.bubble,
            writtenByMe
              ? { backgroundColor: theme.accentSoft, borderBottomRightRadius: 4 }
              : { backgroundColor: theme.paper, borderBottomLeftRadius: 4 },
            highlighted && { borderWidth: 1.5, borderColor: theme.leaf },
          ]}>
          {damagedForMe ? (
            <DamagedText text={text} cells={cells} species={letter.fromPetSpecies} style={[styles.bubbleText, { color: theme.paperInk }]} />
          ) : (
            <ThemedText style={[styles.bubbleText, { color: writtenByMe ? theme.ink : theme.paperInk }]}>{text}</ThemedText>
          )}
        </View>

        {damagedForMe && (
          <View style={styles.damageRow}>
            <ThemedText type="caption" color="danger">
              {speciesInfo(letter.fromPetSpecies).emoji} {t('letters.damage.label')} · {t(effect.labelKey)}
            </ThemedText>
            {reasked ? (
              <ThemedText type="caption" color="muted">
                {t('letters.reask.asked')}
              </ThemedText>
            ) : (
              <Pressable
                onPress={() => handleReask(letter, part)}
                disabled={busyAction === `reask-${letter.id}-${part}`}
                style={[styles.reaskButton, { borderColor: theme.line }]}>
                <ThemedText type="caption">{t('letters.reask.button')}</ThemedText>
              </Pressable>
            )}
          </View>
        )}

        {writtenByMe && reasked && (
          <View style={[styles.reaskNotice, { backgroundColor: theme.card }]}>
            <ThemedText type="caption" color="sub" style={styles.flexShrink}>
              {t('letters.reask.theyAsked', { nickname: otherNickname })}
            </ThemedText>
            <Pressable onPress={() => prefillResend(text)} hitSlop={6}>
              <ThemedText type="caption" color="leaf" style={styles.bold}>
                {t('letters.reask.resend')}
              </ThemedText>
            </Pressable>
          </View>
        )}

        <ThemedText type="caption" color="muted" style={writtenByMe ? styles.textRight : undefined}>
          {at ? relativeTimeFromNow(at) : t('letters.sending')}
        </ThemedText>
      </View>
    );
  }

  const theirDeadline = theirWaiting ? replyDeadlineMs(theirWaiting) : null;
  const myDeadline = myWaiting ? replyDeadlineMs(myWaiting) : null;
  const replyReady = !!theirWaiting && letterReadyForReply(theirWaiting);

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.timeline}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
          {timeline.length === 0 ? (
            <View style={styles.emptyTimeline}>
              <ThemedText type="body" color="sub" style={styles.textCenter}>
                {/* 친구가 아니면 아래 입력칸 대신 "주고받을 수 없어요"가 뜨니, 첫 편지를
                    보내보라는 안내는 빼야 말이 맞는다. */}
                {canSendHere
                  ? t('letters.conversationEmpty', { nickname: otherNickname })
                  : t('letters.conversationEmptyNotFriend', { nickname: otherNickname })}
              </ThemedText>
            </View>
          ) : (
            timeline.map(renderBubble)
          )}
        </ScrollView>

        <View style={[styles.dock, { borderColor: theme.line, backgroundColor: theme.surface }]}>
          {pendingSummon && !theirWaiting && (
            <View style={[styles.waitCard, { backgroundColor: theme.leafSoft }]}>
              <ThemedText type="caption" style={styles.flex}>
                🐾 {t('letters.summon.cardMessage', { nickname: otherNickname })}
              </ThemedText>
              <Pressable onPress={() => setAcceptOpen(true)} style={[styles.smallButton, { backgroundColor: theme.leaf }]}>
                <ThemedText type="caption" color="onLeaf" style={styles.bold}>
                  {t('letters.summon.send')}
                </ThemedText>
              </Pressable>
            </View>
          )}

          {theirWaiting && (
            <View style={[styles.waitCard, { backgroundColor: theme.leafSoft }]}>
              <PetAvatar species={theirWaiting.fromPetSpecies} size={40} />
              <View style={styles.waitText}>
                <ThemedText type="label">{t('letters.visit.waiting', { pet: petName(theirWaiting.fromPetName) })}</ThemedText>
                <ThemedText type="caption" color="leaf" style={styles.tabular}>
                  {petIsOverstaying(theirWaiting, now)
                    ? t('letters.overstaying')
                    : theirDeadline !== null
                      ? t('letters.visit.timeLeft', { time: formatCountdown(theirDeadline - now) })
                      : ''}
                </ThemedText>
                {reaction && (
                  <ThemedText type="caption" color="sub">
                    {reaction}
                  </ThemedText>
                )}
              </View>
              <View style={styles.visitActions}>
                <Pressable
                  onPress={() => handleInteract(theirWaiting, 'pet')}
                  disabled={!!busyAction || !!theirWaiting.visitor?.petted}
                  style={[styles.smallButton, { borderColor: theme.leaf, borderWidth: 1, opacity: theirWaiting.visitor?.petted ? 0.45 : 1 }]}>
                  <ThemedText type="caption">🤚 {t('pets.petAction')}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => handleInteract(theirWaiting, 'snack')}
                  disabled={!!busyAction || !!theirWaiting.visitor?.snacked}
                  style={[styles.smallButton, { borderColor: theme.leaf, borderWidth: 1, opacity: theirWaiting.visitor?.snacked ? 0.45 : 1 }]}>
                  <ThemedText type="caption">🦴 {t('pets.snackAction')}</ThemedText>
                </Pressable>
              </View>
            </View>
          )}

          {myWaiting && (
            <View style={[styles.waitCard, { backgroundColor: theme.background }]}>
              <PetAvatar species={myWaiting.fromPetSpecies} size={32} badge="✉️" />
              <View style={styles.waitText}>
                <ThemedText type="caption">
                  {t('letters.visit.myPetWaiting', { pet: petName(myWaiting.fromPetName), nickname: otherNickname })}
                </ThemedText>
                <ThemedText type="caption" color="leaf" style={styles.tabular}>
                  {petIsOverstaying(myWaiting, now)
                    ? t('letters.overstaying')
                    : myDeadline !== null
                      ? t('letters.visit.timeLeft', { time: formatCountdown(myDeadline - now) })
                      : ''}
                </ThemedText>
              </View>
              <Pressable
                onPress={() => handleRecall(myWaiting)}
                disabled={busyAction === 'recall'}
                style={[styles.smallButton, { backgroundColor: theme.leaf, opacity: busyAction === 'recall' ? 0.6 : 1 }]}>
                <ThemedText type="caption" color="onLeaf" style={styles.bold}>
                  🏠 {t('pets.recall')}
                </ThemedText>
              </Pressable>
            </View>
          )}

          {!canSendHere ? (
            <ThemedText type="caption" color="muted" style={styles.textCenter}>
              {t('letters.notFriend')}
            </ThemedText>
          ) : mode === 'reply' && theirWaiting ? (
            <>
              <ThemedText type="caption" color="sub">
                {t('letters.replyHint', { name: theirWaiting.fromPetName })}
              </ThemedText>
              <Composer
                value={body}
                onChange={setBody}
                placeholder={replyReady ? t('letters.detail.replyPlaceholder') : t('letters.replyPreparing')}
                editable={replyReady}
                sending={sending}
                onSend={handleReply}
              />
              <Pressable onPress={() => setMode('send')} hitSlop={6} style={styles.linkRow}>
                <ThemedText type="caption" color="leaf">
                  {t('letters.switchToSend')}
                </ThemedText>
              </Pressable>
            </>
          ) : myPets.length === 0 ? (
            <View style={styles.noPetRow}>
              <ThemedText type="caption" color="sub" style={styles.flexShrink}>
                {t('letters.compose.noPetYet')}
              </ThemedText>
              <Pressable
                onPress={() => router.push({ pathname: '/(tabs)/letters', params: { section: 'pets' } })}
                style={[styles.smallButton, { backgroundColor: theme.leaf }]}>
                <ThemedText type="caption" color="onLeaf" style={styles.bold}>
                  {t('pets.firstButton')}
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              {idlePets.length === 0 ? (
                <ThemedText type="caption" color="muted">
                  {t('letters.compose.noPetAvailableDescription')}
                </ThemedText>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.petChips}>
                  {idlePets.map((p) => {
                    const active = p.id === selectedPet?.id;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setPetId(p.id)}
                        style={[styles.petChip, { borderColor: active ? theme.leaf : theme.line, backgroundColor: active ? theme.leafSoft : theme.surface }]}>
                        <PetAvatar species={p.species} size={24} />
                        <ThemedText type="caption" color={active ? 'leaf' : 'ink'}>
                          {p.name}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
              {idlePets.length > 0 && <WaitTimePicker value={waitMinutes} onChange={setWaitMinutes} />}
              <Composer
                value={body}
                onChange={setBody}
                placeholder={t('letters.compose.bodyPlaceholder')}
                editable={idlePets.length > 0}
                sending={sending}
                onSend={handleSend}
                sendLabel={t('letters.compose.sendPet')}
              />
              <View style={styles.linkRow}>
                {theirWaiting ? (
                  <Pressable onPress={() => setMode('reply')} hitSlop={6}>
                    <ThemedText type="caption" color="leaf">
                      {t('letters.switchToReply')}
                    </ThemedText>
                  </Pressable>
                ) : (
                  <Pressable onPress={handleSummon} disabled={busyAction === 'summon'} hitSlop={6}>
                    <ThemedText type="caption" color="leaf">
                      🐾 {t('profile.requestPet')}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      <SummonAcceptSheet
        summoner={acceptOpen && other ? { uid: other.uid, nickname: other.nickname, photoURL: other.photoURL } : null}
        onClose={() => setAcceptOpen(false)}
        onSent={() => {
          setAcceptOpen(false);
          setPendingSummon(null);
        }}
      />
    </ThemedView>
  );
}

function Composer({
  value,
  onChange,
  placeholder,
  editable,
  sending,
  onSend,
  sendLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  editable: boolean;
  sending: boolean;
  onSend: () => void;
  sendLabel?: string;
}) {
  const theme = useTheme();
  const { t } = useLocale();
  const disabled = !editable || sending || !value.trim();
  return (
    <View style={styles.composer}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        editable={editable}
        multiline
        maxLength={BODY_MAX_LENGTH}
        style={[styles.input, { color: theme.ink, backgroundColor: theme.background, borderColor: theme.line }]}
      />
      <Pressable
        onPress={onSend}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={sendLabel ?? t('letters.detail.replySend')}
        style={[styles.sendButton, { backgroundColor: theme.leaf, opacity: disabled ? 0.45 : 1 }]}>
        <Ionicons name="paper-plane" size={16} color={theme.onLeaf} />
        {sendLabel && (
          <ThemedText type="caption" color="onLeaf" style={styles.bold}>
            {sendLabel}
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: 220,
  },
  timeline: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  emptyTimeline: {
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  bubbleBlock: {
    maxWidth: '84%',
    gap: 4,
  },
  alignStart: {
    alignSelf: 'flex-start',
  },
  alignEnd: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  carrierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  bubble: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.large,
  },
  bubbleText: {
    fontFamily: 'NanumPenScript_400Regular',
    fontSize: 20,
    lineHeight: 26,
  },
  damageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  reaskButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  reaskNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.small,
  },
  textRight: {
    textAlign: 'right',
  },
  textCenter: {
    textAlign: 'center',
  },
  flexShrink: {
    flexShrink: 1,
  },
  bold: {
    fontWeight: '700',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  dock: {
    borderTopWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  waitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.medium,
  },
  waitText: {
    flex: 1,
    gap: 1,
  },
  visitActions: {
    gap: 4,
  },
  smallButton: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  noPetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  petChips: {
    gap: Spacing.two,
  },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: Spacing.three,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: FontFamily.sans,
    fontSize: 14.5,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  linkRow: {
    alignItems: 'center',
  },
});
