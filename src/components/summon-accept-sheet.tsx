import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { PetAvatar } from '@/components/pet-avatar';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { WaitTimePicker } from '@/components/wait-time-picker';
import { DEFAULT_WAIT_MINUTES, petPersonalityLabel, type WaitMinutes } from '@/constants/pets';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { PetBusyError } from '@/data/letters';
import { listMyPets } from '@/data/pets';
import { respondToSummon } from '@/data/summons';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { PetDoc } from '@/types/pet';
import { notify } from '@/utils/confirm';

/**
 * "펫 보내줘" 수락 — 보낼 펫과 기다릴 시간을 고르면, 그 펫이 메시지 없이 호출한
 * 사람에게 바로 가서 그 사람의 답장을 기다린다(기획서: 호출만으로는 펫이
 * 움직이지 않고, 수락할 때 펫·대기시간을 고른다).
 */
export function SummonAcceptSheet({
  summoner,
  onClose,
  onSent,
}: {
  summoner: { uid: string; nickname: string; photoURL: string | null } | null;
  onClose: () => void;
  onSent: (letterId: string) => void;
}) {
  const theme = useTheme();
  const { t } = useLocale();
  const { user } = useAuth();
  const [pets, setPets] = useState<PetDoc[]>([]);
  const [petId, setPetId] = useState<string | null>(null);
  const [waitMinutes, setWaitMinutes] = useState<WaitMinutes>(DEFAULT_WAIT_MINUTES);
  const [sending, setSending] = useState(false);
  // 시트가 닫히는 애니메이션(아래로 미끄러짐) 동안에도 내용이 그대로 보이게,
  // 마지막으로 열었던 상대를 기억해둔다 — summoner가 null이 되자마자 머리글이
  // 사라져서 닫히는 순간 화면이 깜빡였다.
  const [shown, setShown] = useState(summoner);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (summoner) setShown(summoner);
  }, [summoner]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!user || !summoner) return;
    let active = true;
    listMyPets(user.uid)
      .then((list) => {
        if (!active) return;
        setPets(list);
        setPetId(list.find((p) => p.status === 'idle')?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, summoner]);

  const idlePets = pets.filter((p) => p.status === 'idle');
  const pet = idlePets.find((p) => p.id === petId) ?? null;

  async function handleSend() {
    if (!user || !summoner || !pet) return;
    setSending(true);
    try {
      const letterId = await respondToSummon({ me: { uid: user.uid }, summoner: { uid: summoner.uid }, pet, waitMinutes });
      onSent(letterId);
    } catch (error) {
      console.error('펫을 보내지 못했어요', error);
      notify(t('common.error'), error instanceof PetBusyError ? t('letters.compose.petBusyError') : t('letters.summon.sendFailed'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={!!summoner} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.grabber, { backgroundColor: theme.line }]} />
          {shown && (
            <View style={styles.header}>
              <Avatar uri={shown.photoURL} size={40} />
              <View style={styles.headerText}>
                <ThemedText type="label">{t('letters.summon.sheetTitle', { nickname: shown.nickname })}</ThemedText>
                <ThemedText type="caption" color="sub">
                  {t('letters.summon.sheetHint')}
                </ThemedText>
              </View>
            </View>
          )}

          <ThemedText type="label" color="sub">
            {t('letters.compose.selectPet')}
          </ThemedText>
          {idlePets.length === 0 ? (
            <ThemedText type="caption" color="muted">
              {pets.length === 0 ? t('letters.compose.noPetYet') : t('letters.compose.noPetAvailableDescription')}
            </ThemedText>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.petRow}>
              {idlePets.map((p) => {
                const active = p.id === petId;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setPetId(p.id)}
                    style={[styles.petOption, { borderColor: active ? theme.leaf : theme.line, backgroundColor: active ? theme.leafSoft : theme.surface }]}>
                    <PetAvatar species={p.species} size={40} />
                    <View>
                      <ThemedText type="label">{p.name}</ThemedText>
                      <ThemedText type="caption" color="muted">
                        {petPersonalityLabel(p.personality)}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <ThemedText type="label" color="sub">
            {t('letters.compose.waitLabel')}
          </ThemedText>
          <WaitTimePicker value={waitMinutes} onChange={setWaitMinutes} />

          <View style={styles.actions}>
            <PrimaryButton label={t('letters.summon.later')} variant="outline" onPress={onClose} style={styles.flex} />
            <PrimaryButton tone="leaf" label={t('letters.summon.send')} onPress={handleSend} loading={sending} disabled={!pet} style={styles.flex} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    gap: Spacing.three,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  petRow: {
    gap: Spacing.two,
  },
  petOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
