import { Timestamp } from '@firebase/firestore';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { FormField } from '@/components/form-field';
import { LetterPaper } from '@/components/letter-paper';
import { LoadingView } from '@/components/loading-view';
import { PixelPet } from '@/components/pixel-pet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getLetter, getLetterReply, submitReply } from '@/data/letters';
import { sendSummon } from '@/data/summons';
import { useDecorativeFonts } from '@/hooks/use-decorative-fonts';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { LetterDoc, LetterReplyDoc } from '@/types/letter';
import { notify } from '@/utils/confirm';
import { relativeTimeFromNow } from '@/utils/date';
import { maskLetterBody } from '@/utils/letter-damage';

const REPLY_MAX_LENGTH = 2000;

function remainingLabel(deadline: Timestamp | null, nowMs: number, t: ReturnType<typeof useLocale>['t']): string | null {
  if (!deadline) return null;
  const remainingMs = deadline.toMillis() - nowMs;
  if (remainingMs <= 0) return null;
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  return hours > 0 ? t('letters.detail.remainingHours', { hours }) : t('letters.detail.remainingMinutes', { minutes });
}

export default function LetterDetailScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  // 편지지(LetterPaper)의 손글씨체(나눔손글씨 펜)를 이 화면에 들어올
  // 때만 받는다(use-decorative-fonts.ts).
  useDecorativeFonts();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [letter, setLetter] = useState<LetterDoc | null>(null);
  const [reply, setReply] = useState<LetterReplyDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [summoning, setSummoning] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getLetter(id), getLetterReply(id)])
      .then(([l, r]) => {
        setLetter(l);
        setReply(r);
      })
      .catch((error) => console.error('편지를 불러오지 못했어요', error))
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(load);

  // "N시간 남음"이 화면을 열어둔 채로도 흐르게 한다 — 30초마다 now를
  // 갱신해서 다시 렌더링을 트리거한다(서버 값을 다시 불러올 필요는 없고
  // 그냥 현재 시각 기준으로 다시 계산만 하면 된다).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <LoadingView />;
  if (!letter || !user) return <LoadingView />;

  const isRecipient = letter.toUid === user.uid;
  // 손상은 "받는 쪽"에서만 보여야 한다 — 내가 쓴 편지를 나(원 발신자)한테
  // 다시 찢어진 채로 보여주는 건 앞뒤가 안 맞는다. 받는 사람(isRecipient)
  // 한테만 도착 손상을 적용한다.
  const outbound = isRecipient
    ? maskLetterBody(letter.body, letter.outboundDamage ?? 'none')
    : { text: letter.body, note: null };
  // 답장의 손상은 "펫이 돌아오는 길"에 생기는 거라, 그 답장을 방금 쓴
  // 사람(isRecipient, 즉 letter.toUid 본인)한테는 자기 글이 아직 안
  // 찢어진 원본 그대로 보여야 한다 — 찢어진 채로 보이는 건 그걸 받는
  // 원 발신자(letter.fromUid) 쪽에서만 맞다.
  const replyMasked = reply
    ? isRecipient
      ? { text: reply.body, note: null }
      : maskLetterBody(reply.body, reply.damage ?? 'none')
    : null;
  // replyDeadline은 onLetterCreated(서버 트리거)가 채우는데, 편지를 막
  // 보낸 사람은 sendLetter가 끝나자마자 이 화면으로 바로 넘어와서(compose.tsx)
  // 트리거가 아직 안 끝났을 수 있다 — 그 짧은 순간엔 replyDeadline이 null이라
  // "남은 시간"이 잠깐 안 뜨고, 심지어 받는 사람이 그 순간 하필 같이
  // 열어보면 답장창까지 안 뜨는 문제가 있었다. 서버와 똑같은 계산식
  // (createdAt + waitHours)으로 클라이언트가 임시로 추정해서 그 공백을
  // 없앤다 — 트리거가 끝나면 어차피 서버 값으로 정확히 맞춰진다.
  const effectiveDeadline =
    letter.replyDeadline ??
    (letter.createdAt ? Timestamp.fromMillis(letter.createdAt.toMillis() + letter.waitHours * 60 * 60 * 1000) : null);
  const remaining = letter.status === 'awaiting_reply' ? remainingLabel(effectiveDeadline, now, t) : null;
  const canReply = isRecipient && letter.status === 'awaiting_reply' && !reply && !!remaining;
  const canRequestPetAgain = isRecipient && letter.status === 'expired' && !reply;

  async function handleSendReply() {
    if (!id || !replyBody.trim()) return;
    setSendingReply(true);
    try {
      await submitReply(id, replyBody);
      setReplyBody('');
      load();
    } catch (error) {
      console.error('답장을 보내지 못했어요', error);
      notify(t('common.error'), t('letters.detail.replySendFailed'));
    } finally {
      setSendingReply(false);
    }
  }

  async function handleRequestPetAgain() {
    if (!user || !letter) return;
    setSummoning(true);
    try {
      await sendSummon({ uid: user.uid, nickname: letter.toNickname, photoURL: letter.toPhotoURL }, letter.fromUid);
      notify(t('profile.summonSentTitle'), t('profile.summonSentMessage', { nickname: letter.fromNickname }));
    } catch {
      notify(t('common.error'), t('profile.summonFailed'));
    } finally {
      setSummoning(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.letterBlock}>
          <View style={styles.letterHeader}>
            <Avatar uri={letter.fromPhotoURL} size={36} />
            <View style={styles.letterHeaderText}>
              <ThemedText type="label">{letter.fromNickname}</ThemedText>
              <ThemedText type="caption" color="muted">
                {relativeTimeFromNow(letter.createdAt)}
              </ThemedText>
            </View>
            <PixelPet species={letter.fromPetSpecies} size={36} />
          </View>
          <LetterPaper damageLevel={isRecipient ? (letter.outboundDamage ?? 'none') : 'none'} text={outbound.text} note={outbound.note} />
          {remaining && (
            <ThemedText type="caption" color="accentInk">
              {remaining}
            </ThemedText>
          )}
        </View>

        {reply && replyMasked && (
          <View style={styles.letterBlock}>
            <ThemedText type="label">{t('letters.detail.replyLabel')}</ThemedText>
            <LetterPaper
              damageLevel={isRecipient ? 'none' : (reply.damage ?? 'none')}
              text={replyMasked.text}
              note={replyMasked.note}
            />
          </View>
        )}

        {canReply && (
          <View style={styles.replyForm}>
            <FormField
              label={t('letters.detail.replyPlaceholder')}
              value={replyBody}
              onChangeText={setReplyBody}
              multiline
              maxLength={REPLY_MAX_LENGTH}
            />
            <Pressable
              onPress={handleSendReply}
              disabled={sendingReply || !replyBody.trim()}
              style={[styles.actionButton, { backgroundColor: theme.accent, opacity: sendingReply || !replyBody.trim() ? 0.5 : 1 }]}>
              <ThemedText type="button" color="onAccent">
                {t('letters.detail.replySend')}
              </ThemedText>
            </Pressable>
          </View>
        )}

        {canRequestPetAgain && (
          <Pressable
            onPress={handleRequestPetAgain}
            disabled={summoning}
            style={[styles.actionButton, { borderColor: theme.line, borderWidth: 1, opacity: summoning ? 0.5 : 1 }]}>
            <ThemedText type="button">{t('letters.detail.requestPetAgain')}</ThemedText>
          </Pressable>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  letterBlock: {
    gap: Spacing.two,
  },
  letterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  letterHeaderText: {
    flex: 1,
    gap: 2,
  },
  replyForm: {
    gap: Spacing.two,
  },
  actionButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.large,
  },
});
