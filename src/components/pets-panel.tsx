import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { LoadingView } from '@/components/loading-view';
import { PetAvatar } from '@/components/pet-avatar';
import { PetCard } from '@/components/pet-card';
import { PrimaryButton } from '@/components/primary-button';
import { SpeciesPicker } from '@/components/species-picker';
import { ThemedText } from '@/components/themed-text';
import { DEFAULT_PET_RULES, SECOND_PET_MISSION_DAY_COUNT, type PetRules } from '@/constants/pets';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getLetter } from '@/data/letters';
import {
  adoptPet,
  canClaimMissionPet,
  getPetRules,
  interactWithPet,
  PetActionError,
  recallPet,
  renamePet,
  subscribeMyPets,
} from '@/data/pets';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { LetterDoc } from '@/types/letter';
import type { PetDoc, PetSpeciesKey } from '@/types/pet';
import { confirmAsync, notify } from '@/utils/confirm';
import { petName } from '@/utils/josa';
import { randomPetReaction } from '@/utils/pet-reactions';

/**
 * "내 펫" — 편지함 탭의 두 번째 칸이자 /pets 화면 본문. 펫 상태가 서버에서
 * 바뀌면(답장이 와서 돌아옴, 자동 복귀, 친밀도 상승) 실시간으로 반영된다.
 */
export function PetsPanel() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user, profile, refreshProfile } = useAuth();
  const [pets, setPets] = useState<PetDoc[] | null>(null);
  const [awayLetters, setAwayLetters] = useState<Record<string, LetterDoc>>({});
  const [rules, setRules] = useState<PetRules>(DEFAULT_PET_RULES);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyPetId, setBusyPetId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [renameTarget, setRenameTarget] = useState<PetDoc | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!user) return;
    getPetRules().then(setRules).catch(() => undefined);
    return subscribeMyPets(
      user.uid,
      setPets,
      (error) => console.error('펫 목록을 불러오지 못했어요', error)
    );
  }, [user]);

  // 나가 있는 펫이 누구 곁에 있는지는 편지 문서에만 있어서 따로 읽는다.
  const awayKey = useMemo(
    () => (pets ?? []).filter((p) => p.status === 'away' && p.currentLetterId).map((p) => `${p.id}:${p.currentLetterId}`).join(','),
    [pets]
  );
  useEffect(() => {
    if (!pets) return;
    const away = pets.filter((p) => p.status === 'away' && p.currentLetterId);
    let active = true;
    Promise.all(away.map((p) => getLetter(p.currentLetterId as string).catch(() => null))).then((letters) => {
      if (!active) return;
      const map: Record<string, LetterDoc> = {};
      away.forEach((p, i) => {
        const l = letters[i];
        if (l) map[p.id] = l;
      });
      setAwayLetters(map);
    });
    return () => {
      active = false;
    };
    // awayKey가 바뀔 때(=누가 어느 편지로 나갔는지가 바뀔 때)만 다시 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awayKey]);

  // 남은 시간을 1초마다 흐르게 한다(나가 있는 펫이 있을 때만).
  const anyAway = (pets ?? []).some((p) => p.status === 'away');
  useEffect(() => {
    if (!anyAway) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [anyAway]);

  if (!user || !profile || pets === null) return <LoadingView />;

  const petCount = profile.petCount ?? pets.length;
  const canAdoptFirst = pets.length === 0 && petCount === 0;
  const canAdoptMission = canClaimMissionPet({ petCount, dayCount: profile.dayCount });

  async function handleAdopt(species: PetSpeciesKey, name: string) {
    if (!user) return;
    try {
      await adoptPet(user.uid, species, name);
      await refreshProfile();
      setPickerOpen(false);
    } catch (error) {
      console.error('펫을 데려오지 못했어요', error);
      notify(t('common.error'), t('pets.adoptFailed'));
    }
  }

  async function handleRecall(pet: PetDoc) {
    const ok = await confirmAsync(
      t('pets.recallConfirmTitle', { pet: petName(pet.name, '을/를') }),
      t('pets.recallConfirmMessage'),
      t('pets.recall')
    );
    if (!ok) return;
    setBusyPetId(pet.id);
    try {
      await recallPet(pet.id);
    } catch (error) {
      notify(t('common.error'), error instanceof PetActionError && error.code === 'too-many-requests' ? t('users.tooManyRequests') : t('pets.recallFailed'));
    } finally {
      setBusyPetId(null);
    }
  }

  async function handleInteract(pet: PetDoc, kind: 'pet' | 'snack') {
    if (!user) return;
    setBusyPetId(pet.id);
    try {
      const result = await interactWithPet(user.uid, pet.id, kind);
      const reaction = randomPetReaction(kind, pet.name);
      setReactions((prev) => ({
        ...prev,
        [pet.id]: result.gained > 0 ? `${reaction} · ${t('pets.intimacyUp', { n: result.gained })}` : reaction,
      }));
    } catch (error) {
      const code = error instanceof PetActionError ? error.code : '';
      notify(t('common.error'), code === 'already-today' ? t('pets.alreadyToday') : t('pets.interactFailed'));
    } finally {
      setBusyPetId(null);
    }
  }

  async function handleRename() {
    if (!user || !renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    try {
      await renamePet(user.uid, renameTarget.id, renameValue.trim());
      setRenameTarget(null);
    } catch {
      notify(t('common.error'), t('pets.renameFailed'));
    } finally {
      setRenaming(false);
    }
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        {canAdoptFirst ? (
          <View style={[styles.introCard, { backgroundColor: theme.leafSoft }]}>
            <View style={styles.introAvatars}>
              <PetAvatar species="dog" size={52} />
              <PetAvatar species="cat" size={52} />
              <PetAvatar species="rabbit" size={52} />
            </View>
            <ThemedText type="title" style={styles.center}>
              {t('pets.firstTitle')}
            </ThemedText>
            <ThemedText type="caption" color="sub" style={styles.center}>
              {t('pets.firstDescription')}
            </ThemedText>
            <PrimaryButton tone="leaf" label={t('pets.firstButton')} onPress={() => setPickerOpen(true)} style={styles.stretch} />
          </View>
        ) : (
          pets.map((pet) => (
            <PetCard
              key={pet.id}
              pet={pet}
              awayLetter={awayLetters[pet.id] ?? null}
              nowMs={now}
              rules={rules}
              busy={busyPetId === pet.id}
              reaction={reactions[pet.id] ?? null}
              onRename={() => {
                setRenameTarget(pet);
                setRenameValue(pet.name);
              }}
              onRecall={() => handleRecall(pet)}
              onInteract={(kind) => handleInteract(pet, kind)}
            />
          ))
        )}

        {!canAdoptFirst && canAdoptMission && (
          <View style={[styles.missionCard, { borderColor: theme.leaf, backgroundColor: theme.leafSoft }]}>
            <ThemedText type="label" color="leaf">
              {t('pets.missionReadyTitle')}
            </ThemedText>
            <ThemedText type="caption" color="sub">
              {t('pets.missionReadyMessage')}
            </ThemedText>
            <PrimaryButton tone="leaf" label={t('pets.missionReadyButton')} onPress={() => setPickerOpen(true)} />
          </View>
        )}

        {!canAdoptFirst && !canAdoptMission && petCount === 1 && (
          <View style={[styles.missionCard, { borderColor: theme.line }]}>
            <ThemedText type="label">{t('pets.missionTitle')}</ThemedText>
            <ThemedText type="caption" color="sub">
              {t('pets.missionProgress', { count: profile.dayCount, goal: SECOND_PET_MISSION_DAY_COUNT })}
            </ThemedText>
            <View style={[styles.missionTrack, { backgroundColor: theme.card }]}>
              <View
                style={[
                  styles.missionFill,
                  { backgroundColor: theme.leaf, width: `${Math.min(100, (profile.dayCount / SECOND_PET_MISSION_DAY_COUNT) * 100)}%` },
                ]}
              />
            </View>
          </View>
        )}

        {pets.length > 0 && (
          <Pressable onPress={() => router.push('/letters/compose')} style={[styles.sendLink, { borderColor: theme.line }]}>
            <ThemedText type="caption" color="sub">
              {t('pets.sendLetterLink')}
            </ThemedText>
          </Pressable>
        )}

        {pets.length > 0 && (
          <ThemedText type="caption" color="muted" style={styles.center}>
            {t('pets.intimacyHelp')}
          </ThemedText>
        )}
      </ScrollView>

      <SpeciesPicker
        visible={pickerOpen}
        title={canAdoptFirst ? t('pets.picker.firstTitle') : t('pets.picker.newTitle')}
        onClose={() => setPickerOpen(false)}
        onAdopt={handleAdopt}
      />

      <Modal visible={!!renameTarget} animationType="slide" transparent onRequestClose={() => setRenameTarget(null)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRenameTarget(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <ThemedText type="label">{t('pets.renameTitle')}</ThemedText>
            <FormField value={renameValue} onChangeText={setRenameValue} placeholder={t('pets.renamePlaceholder')} maxLength={20} />
            <PrimaryButton tone="leaf" label={t('dayDetail.save')} onPress={handleRename} loading={renaming} disabled={!renameValue.trim()} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  introCard: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.large,
  },
  introAvatars: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
  missionCard: {
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    gap: Spacing.two,
  },
  missionTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  missionFill: {
    height: '100%',
    borderRadius: 3,
  },
  sendLink: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    gap: Spacing.three,
  },
});
