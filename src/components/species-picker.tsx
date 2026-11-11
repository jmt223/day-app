import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { PetAvatar } from '@/components/pet-avatar';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { PET_SPECIES, petSpeciesLabel } from '@/constants/pets';
import { Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { PetSpeciesKey } from '@/types/pet';

/**
 * 펫 데려오기 — 14종 중에서 직접 고르고 이름을 붙인다(기획서: 최초 펫의 종은
 * 사용자가 선택). 성격은 기획상 부여 방식이 미정이라 데려올 때 무작위로 정해진다.
 */
export function SpeciesPicker({
  visible,
  title,
  onClose,
  onAdopt,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onAdopt: (species: PetSpeciesKey, name: string) => Promise<void>;
}) {
  const theme = useTheme();
  const { t } = useLocale();
  const [species, setSpecies] = useState<PetSpeciesKey | null>(null);
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  function choose(key: PetSpeciesKey) {
    setSpecies(key);
    // 이름을 직접 고치기 전까지는 고른 종 이름을 기본 이름으로 채워둔다.
    if (!nameEdited) setName(petSpeciesLabel(key));
  }

  function reset() {
    setSpecies(null);
    setName('');
    setNameEdited(false);
  }

  async function handleAdopt() {
    if (!species || !name.trim()) return;
    setSaving(true);
    try {
      await onAdopt(species, name.trim());
      reset();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.cancel')} />
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.grabber, { backgroundColor: theme.line }]} />
          <ThemedText type="title">{title}</ThemedText>
          <ThemedText type="caption" color="sub">
            {t('pets.picker.hint')}
          </ThemedText>

          <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid}>
            {PET_SPECIES.map((s) => {
              const active = s.key === species;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => choose(s.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.tile,
                    { borderColor: active ? theme.leaf : theme.line, backgroundColor: active ? theme.leafSoft : theme.surface },
                  ]}>
                  <PetAvatar species={s.key} size={44} />
                  <ThemedText type="caption" color={active ? 'leaf' : 'ink'} numberOfLines={1}>
                    {petSpeciesLabel(s.key)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          <FormField
            label={t('pets.picker.nameLabel')}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setNameEdited(true);
            }}
            placeholder={t('pets.renamePlaceholder')}
            maxLength={20}
          />
          <PrimaryButton
            tone="leaf"
            label={t('pets.picker.adopt')}
            onPress={handleAdopt}
            loading={saving}
            disabled={!species || !name.trim()}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: '92%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  gridScroll: {
    flexGrow: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  tile: {
    width: 72,
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
  },
});
