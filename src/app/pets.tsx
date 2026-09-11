import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { LoadingView } from '@/components/loading-view';
import { PixelPet } from '@/components/pixel-pet';
import { PrimaryButton } from '@/components/primary-button';
import { FormField } from '@/components/form-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { damageProbabilityPercent, petPersonalityLabel, petSpeciesLabel, SECOND_PET_MISSION_DAY_COUNT } from '@/constants/pets';
import { useAuth } from '@/context/auth-context';
import { getLetter } from '@/data/letters';
import { canClaimMissionPet, ensureStarterPet, grantMissionPet, listMyPets, renamePet } from '@/data/pets';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { LetterDoc } from '@/types/letter';
import type { PetDoc } from '@/types/pet';
import { notify } from '@/utils/confirm';

export default function PetsScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user, profile, refreshProfile } = useAuth();
  const [pets, setPets] = useState<PetDoc[]>([]);
  const [awayLetters, setAwayLetters] = useState<Record<string, LetterDoc>>({});
  const [loading, setLoading] = useState(true);
  const [renameTarget, setRenameTarget] = useState<PetDoc | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    if (!user || !profile) return;
    // 이 기능 이전에 이미 가입한 계정은 petCount가 아예 없다 — 본인이 이
    // 화면을 여는 시점에 자기 계정에 스스로 쓰는 것이라(다른 계정을
    // 건드리는 게 아니라) 안전하게 그 자리에서 첫 펫을 지급한다.
    const granted = await ensureStarterPet(user.uid, profile);
    if (!granted && canClaimMissionPet(profile)) {
      await grantMissionPet(user.uid);
      notify(t('pets.missionCompleteTitle'), t('pets.missionCompleteMessage'));
    }
    await refreshProfile();
    const list = await listMyPets(user.uid);
    setPets(list);

    // "나가있는" 펫이 누구에게 갔는지 보여주려고, 그 편지를 마저 읽어온다
    // — 펫 문서 자체엔 dayId/닉네임 같은 상대 정보가 없어서(그건
    // letters 문서 쪽에만 있음) currentLetterId로 역참조한다.
    const awayPets = list.filter((p) => p.status === 'away' && p.currentLetterId);
    if (awayPets.length > 0) {
      const letters = await Promise.all(awayPets.map((p) => getLetter(p.currentLetterId as string).catch(() => null)));
      const map: Record<string, LetterDoc> = {};
      awayPets.forEach((p, i) => {
        const l = letters[i];
        if (l) map[p.id] = l;
      });
      setAwayLetters(map);
    } else {
      setAwayLetters({});
    }
  }, [user, profile, refreshProfile, t]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load()
        .catch((err) => console.error('펫 정보를 불러오지 못했어요', err))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.petCount, profile?.dayCount])
  );

  function openRenameModal(pet: PetDoc) {
    setRenameTarget(pet);
    setRenameValue(pet.name);
  }

  async function handleRename() {
    if (!user || !renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    try {
      await renamePet(user.uid, renameTarget.id, renameValue.trim());
      setPets((prev) => prev.map((p) => (p.id === renameTarget.id ? { ...p, name: renameValue.trim() } : p)));
      setRenameTarget(null);
    } catch {
      notify(t('common.error'), t('pets.renameFailed'));
    } finally {
      setRenaming(false);
    }
  }

  if (loading) return <LoadingView />;

  const dayCount = profile?.dayCount ?? 0;
  const showMissionProgress = pets.length === 1 && dayCount < SECOND_PET_MISSION_DAY_COUNT;

  return (
    <ThemedView style={styles.flex}>
      <View style={styles.container}>
        {pets.map((pet) => {
          const percent = damageProbabilityPercent(pet.species, pet.personality);
          const awayLetter = awayLetters[pet.id];
          return (
            <View key={pet.id} style={[styles.card, { borderColor: theme.line }]}>
              <PixelPet species={pet.species} size={64} />
              <View style={styles.cardText}>
                <View style={styles.nameRow}>
                  <ThemedText type="label">{pet.name}</ThemedText>
                  <Pressable onPress={() => openRenameModal(pet)} hitSlop={8}>
                    <Ionicons name="pencil-outline" size={14} color={theme.muted} />
                  </Pressable>
                </View>
                <ThemedText type="caption" color="sub">
                  {petSpeciesLabel(pet.species)} · {petPersonalityLabel(pet.personality)}
                </ThemedText>
                <ThemedText type="caption" color="muted">
                  {pet.status === 'idle'
                    ? t('pets.statusIdle')
                    : awayLetter
                      ? t('pets.awayTo', { nickname: awayLetter.toNickname })
                      : t('pets.statusAway')}
                </ThemedText>
                <ThemedText type="caption" color="muted">
                  {t('pets.damageChance', { percent })}
                </ThemedText>
              </View>
            </View>
          );
        })}

        {showMissionProgress && (
          <View style={[styles.missionCard, { borderColor: theme.line }]}>
            <ThemedText type="label">{t('pets.missionTitle')}</ThemedText>
            <ThemedText type="caption" color="sub">
              {t('pets.missionProgress', { count: dayCount, goal: SECOND_PET_MISSION_DAY_COUNT })}
            </ThemedText>
          </View>
        )}
      </View>

      <Modal visible={!!renameTarget} animationType="slide" transparent onRequestClose={() => setRenameTarget(null)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRenameTarget(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <ThemedText type="label">{t('pets.renameTitle')}</ThemedText>
            <FormField value={renameValue} onChangeText={setRenameValue} placeholder={t('pets.renamePlaceholder')} maxLength={20} />
            <PrimaryButton label={t('dayDetail.save')} onPress={handleRename} loading={renaming} disabled={!renameValue.trim()} />
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  missionCard: {
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    gap: 3,
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
