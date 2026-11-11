import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { PetAvatar } from '@/components/pet-avatar';
import { ThemedText } from '@/components/themed-text';
import { damagePercentFor, petPersonalityDescription, petPersonalityLabel, petSpeciesLabel, type PetRules } from '@/constants/pets';
import { Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { LetterDoc } from '@/types/letter';
import type { PetDoc } from '@/types/pet';
import { todayKstLabel } from '@/utils/date';
import { formatCountdown, petIsOverstaying, replyDeadlineMs } from '@/utils/letters';

/**
 * 내 펫 한 마리(목업의 "내 펫" 카드). 지금 어디 있는지(누구 곁에서 몇 분 더
 * 기다리는지 / 계속 머무는 중 / 집에서 쉬는 중), 친밀도, 배달 기록을 보여주고,
 * 집에 있으면 쓰다듬기·간식, 나가 있으면 "일로 와"를 누를 수 있다.
 */
export function PetCard({
  pet,
  awayLetter,
  nowMs,
  rules,
  busy,
  reaction,
  onRename,
  onRecall,
  onInteract,
}: {
  pet: PetDoc;
  awayLetter: LetterDoc | null;
  nowMs: number;
  rules: PetRules;
  busy: boolean;
  reaction: string | null;
  onRename: () => void;
  onRecall: () => void;
  onInteract: (kind: 'pet' | 'snack') => void;
}) {
  const theme = useTheme();
  const { t } = useLocale();
  const intimacy = pet.intimacy ?? 0;
  const stats = pet.stats ?? {};
  const today = todayKstLabel();
  const pettedToday = pet.daily?.day === today && pet.daily.petted;
  const snackedToday = pet.daily?.day === today && pet.daily.snacked;
  const away = pet.status === 'away';

  let statusLine: string;
  let timerText: string | null = null;
  if (!away) {
    statusLine = t('pets.atHome');
  } else if (!awayLetter) {
    statusLine = t('pets.statusAway');
  } else if (petIsOverstaying(awayLetter, nowMs)) {
    statusLine = t('pets.overstayingWith', { nickname: awayLetter.toNickname });
  } else {
    statusLine = t('pets.waitingWith', { nickname: awayLetter.toNickname });
    const deadline = replyDeadlineMs(awayLetter);
    if (deadline !== null) timerText = formatCountdown(deadline - nowMs);
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}>
      <View style={styles.topRow}>
        <PetAvatar species={pet.species} size={76} badge={away ? '✉️' : undefined} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <ThemedText type="title" numberOfLines={1} style={styles.name}>
              {pet.name}
            </ThemedText>
            <View style={[styles.chip, { backgroundColor: theme.leafSoft }]}>
              <ThemedText type="caption" color="leaf">
                {petPersonalityLabel(pet.personality)}
              </ThemedText>
            </View>
            <Pressable onPress={onRename} hitSlop={8} accessibilityLabel={t('pets.renameTitle')}>
              <Ionicons name="pencil-outline" size={14} color={theme.muted} />
            </Pressable>
          </View>
          <ThemedText type="caption" color="sub" numberOfLines={2}>
            {petPersonalityDescription(pet.personality)}
          </ThemedText>
          <ThemedText type="caption" color="muted">
            {petSpeciesLabel(pet.species)} · {t('pets.damageChance', { percent: damagePercentFor(pet.personality, intimacy, rules) })}
          </ThemedText>
          <View style={styles.statusRow}>
            <Ionicons name={away ? 'paper-plane-outline' : 'home-outline'} size={14} color={away ? theme.leaf : theme.sub} />
            <ThemedText type="caption" color={away ? 'leaf' : 'sub'} style={styles.statusText} numberOfLines={2}>
              {statusLine}
            </ThemedText>
          </View>
          {timerText && (
            <View style={styles.statusRow}>
              <Ionicons name="time-outline" size={14} color={theme.ink} />
              <ThemedText type="label" style={styles.timer}>
                {timerText}
              </ThemedText>
            </View>
          )}
        </View>
      </View>

      {away ? (
        <Pressable
          onPress={onRecall}
          disabled={busy}
          style={[styles.primaryAction, { backgroundColor: theme.leaf, opacity: busy ? 0.6 : 1 }]}
          accessibilityRole="button">
          <Ionicons name="home" size={16} color={theme.onLeaf} />
          <ThemedText type="button" color="onLeaf">
            {t('pets.recall')}
          </ThemedText>
        </Pressable>
      ) : (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => onInteract('pet')}
            disabled={busy || pettedToday}
            style={[styles.secondaryAction, { borderColor: theme.line, opacity: busy || pettedToday ? 0.5 : 1 }]}
            accessibilityRole="button">
            <ThemedText type="caption">{pettedToday ? t('pets.pettedToday') : `🤚 ${t('pets.petAction')}`}</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => onInteract('snack')}
            disabled={busy || snackedToday}
            style={[styles.secondaryAction, { borderColor: theme.line, opacity: busy || snackedToday ? 0.5 : 1 }]}
            accessibilityRole="button">
            <ThemedText type="caption">{snackedToday ? t('pets.snackedToday') : `🦴 ${t('pets.snackAction')}`}</ThemedText>
          </Pressable>
        </View>
      )}

      {reaction && (
        <ThemedText type="caption" color="leaf" style={styles.reaction}>
          {reaction}
        </ThemedText>
      )}

      <View style={styles.intimacyBlock}>
        <View style={styles.intimacyHeader}>
          <ThemedText type="caption" color="sub">
            ❤️ {t('pets.intimacy')}
          </ThemedText>
          <ThemedText type="caption" color="sub">
            {intimacy} / {rules.intimacy.max}
          </ThemedText>
        </View>
        <View style={[styles.barTrack, { backgroundColor: theme.card }]}>
          <View style={[styles.barFill, { backgroundColor: theme.danger, width: `${Math.min(100, (intimacy / rules.intimacy.max) * 100)}%` }]} />
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat icon="mail-outline" label={t('pets.stat.deliveries')} value={stats.deliveries ?? 0} />
        <Stat icon="document-outline" label={t('pets.stat.damaged')} value={stats.damaged ?? 0} />
        <Stat icon="flash-outline" label={t('pets.stat.earlyReturns')} value={stats.earlyReturns ?? 0} />
      </View>
      {((stats.pettedByOthers ?? 0) > 0 || (stats.snacksFromOthers ?? 0) > 0) && (
        <ThemedText type="caption" color="muted">
          {t('pets.fromOthers', { pets: stats.pettedByOthers ?? 0, snacks: stats.snacksFromOthers ?? 0 })}
        </ThemedText>
      )}
    </View>
  );
}

function Stat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  const theme = useTheme();
  const { t } = useLocale();
  return (
    <View style={[styles.stat, { backgroundColor: theme.background }]}>
      <Ionicons name={icon} size={14} color={theme.sub} />
      <ThemedText type="caption" color="sub" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="label">{t('pets.stat.times', { n: value })}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    gap: Spacing.three,
  },
  topRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    flex: 1,
  },
  timer: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.medium,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  secondaryAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  reaction: {
    textAlign: 'center',
  },
  intimacyBlock: {
    gap: 6,
  },
  intimacyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
  },
});
