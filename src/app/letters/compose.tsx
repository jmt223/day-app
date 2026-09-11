import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { LoadingView } from '@/components/loading-view';
import { PixelPet } from '@/components/pixel-pet';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listFriends } from '@/data/friends';
import { PetBusyError, sendLetter } from '@/data/letters';
import { ensureStarterPet, listMyPets } from '@/data/pets';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { FriendEntry } from '@/types/user';
import type { PetDoc } from '@/types/pet';
import { notify } from '@/utils/confirm';

const WAIT_HOUR_OPTIONS = [6, 12, 24, 48];
const BODY_MAX_LENGTH = 2000;

export default function ComposeLetterScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user, profile, refreshProfile } = useAuth();
  const { to } = useLocalSearchParams<{ to?: string }>();

  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [recipient, setRecipient] = useState<FriendEntry | null>(null);
  const [pets, setPets] = useState<PetDoc[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [waitHours, setWaitHours] = useState(24);
  const [sending, setSending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user || !profile) return;
      let active = true;
      setLoading(true);
      // 편지 쓰기가 "펫이 있어야 의미 있는" 화면 중 하나라, 이 기능 이전
      // 가입자가 편지함 탭을 거치지 않고 바로 여기로 들어와도(예: 호출
      // 배너의 "편지 쓰기" 버튼) 펫이 하나도 없는 채로 "펫이 모두 배달
      // 중"이라는 엉뚱한 안내를 보지 않게 먼저 확인한다.
      ensureStarterPet(user.uid, profile)
        .then((granted) => {
          if (granted) return refreshProfile();
        })
        .catch(() => undefined)
        .then(() => Promise.all([listFriends(user.uid), listMyPets(user.uid)]))
        .then(([friendList, petList]) => {
          if (!active) return;
          setFriends(friendList);
          setPets(petList);
          const idlePets = petList.filter((p) => p.status === 'idle');
          setSelectedPetId(idlePets[0]?.id ?? null);
          if (to) {
            const match = friendList.find((f) => f.friendUid === to);
            setRecipient(match ?? null);
          }
        })
        .catch((error) => console.error('편지 쓰기 화면을 준비하지 못했어요', error))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, to, profile?.petCount])
  );

  if (loading) return <LoadingView />;

  const idlePets = pets.filter((p) => p.status === 'idle');
  const selectedPet = idlePets.find((p) => p.id === selectedPetId) ?? null;

  async function handleSend() {
    if (!user || !profile || !recipient || !selectedPet || !body.trim()) return;
    setSending(true);
    try {
      const letterId = await sendLetter({
        from: { uid: user.uid, nickname: profile.nickname, photoURL: profile.photoURL },
        to: { uid: recipient.friendUid, nickname: recipient.nickname, photoURL: recipient.photoURL },
        pet: selectedPet,
        body,
        waitHours,
      });
      router.replace(`/letters/${letterId}`);
    } catch (error) {
      if (error instanceof PetBusyError) {
        notify(t('common.error'), t('letters.compose.petBusyError'));
      } else {
        notify(t('common.error'), t('letters.compose.sendFailed'));
      }
    } finally {
      setSending(false);
    }
  }

  // to 파라미터 없이 들어왔거나, 아직 받을 친구를 못 골랐으면 친구 목록부터
  // 고르게 한다.
  if (!recipient) {
    return (
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container}>
          <ThemedText type="label" color="sub">
            {t('letters.compose.selectFriend')}
          </ThemedText>
          {friends.length === 0 ? (
            <>
              <EmptyState icon="people-outline" title={t('letters.compose.noFriends')} />
              <PrimaryButton
                label={t('letters.compose.goToFriends')}
                variant="outline"
                onPress={() => router.push('/(tabs)/friends')}
              />
            </>
          ) : (
            friends.map((f) => (
              <Pressable key={f.friendUid} style={[styles.friendRow, { borderColor: theme.line }]} onPress={() => setRecipient(f)}>
                <Avatar uri={f.photoURL} size={40} />
                <ThemedText type="body">{f.nickname}</ThemedText>
              </Pressable>
            ))
          )}
        </ScrollView>
      </ThemedView>
    );
  }

  if (idlePets.length === 0) {
    return (
      <ThemedView style={styles.flex}>
        <EmptyState
          icon="paw-outline"
          title={t('letters.compose.noPetAvailableTitle')}
          description={t('letters.compose.noPetAvailableDescription')}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.recipientRow, { borderColor: theme.line }]}>
          <Avatar uri={recipient.photoURL} size={40} />
          <ThemedText type="body">{recipient.nickname}</ThemedText>
        </View>

        <ThemedText type="label" color="sub">
          {t('letters.compose.selectPet')}
        </ThemedText>
        <View style={styles.petRow}>
          {idlePets.map((pet) => (
            <Pressable
              key={pet.id}
              onPress={() => setSelectedPetId(pet.id)}
              style={[
                styles.petOption,
                { borderColor: pet.id === selectedPetId ? theme.accent : theme.line },
              ]}>
              <PixelPet species={pet.species} size={44} />
              <ThemedText type="caption">{pet.name}</ThemedText>
            </Pressable>
          ))}
        </View>

        <FormField
          label={t('letters.compose.bodyLabel')}
          placeholder={t('letters.compose.bodyPlaceholder')}
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={BODY_MAX_LENGTH}
        />

        <ThemedText type="label" color="sub">
          {t('letters.compose.waitHoursLabel')}
        </ThemedText>
        <View style={styles.waitRow}>
          {WAIT_HOUR_OPTIONS.map((hours) => (
            <Pressable
              key={hours}
              onPress={() => setWaitHours(hours)}
              style={[
                styles.waitOption,
                { borderColor: hours === waitHours ? theme.accent : theme.line },
                hours === waitHours && { backgroundColor: theme.accentSoft },
              ]}>
              <ThemedText type="caption" color={hours === waitHours ? 'accentInk' : 'sub'}>
                {t('letters.compose.waitHoursOption', { hours })}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={handleSend}
          disabled={sending || !body.trim()}
          style={[styles.sendButton, { backgroundColor: theme.accent, opacity: sending || !body.trim() ? 0.5 : 1 }]}>
          <ThemedText type="button" color="onAccent">
            {t('letters.compose.send')}
          </ThemedText>
        </Pressable>
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
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
  },
  petRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    flexWrap: 'wrap',
  },
  petOption: {
    alignItems: 'center',
    gap: 4,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 2,
  },
  waitRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  waitOption: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  sendButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.large,
    marginTop: Spacing.two,
  },
});
