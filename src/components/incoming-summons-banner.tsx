import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listIncomingSummons, type IncomingSummon } from '@/data/summons';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';

/** "펫 좀 보내줘" 호출을 편지함 위에 배너로 보여준다. 호출 문서 자체는
 * 지울 수 없어서(firestore.rules 참고, 삭제를 허용하면 24시간 쿨다운을
 * 우회할 수 있다) 12시간이 지나거나 이 화면에서 직접 닫으면(로컬 상태만,
 * 앱을 다시 열면 다시 보일 수 있음) 안 보이게 한다 — "나중에 조정"
 * 대상으로 남겨둔 가벼운 트레이드오프다. */
export function IncomingSummonsBanner() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user } = useAuth();
  const [summons, setSummons] = useState<IncomingSummon[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      listIncomingSummons(user.uid)
        .then((list) => active && setSummons(list))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [user])
  );

  const visible = summons.filter((s) => !dismissed.has(s.fromUid));
  if (visible.length === 0) return null;

  return (
    <View style={styles.container}>
      {visible.map((summon) => (
        <ThemedView key={summon.fromUid} surface="accentSoft" style={[styles.banner, { borderColor: theme.line }]}>
          <ThemedText type="caption" style={styles.text}>
            {t('letters.summonBannerTitle', { nickname: summon.fromNickname })}
          </ThemedText>
          <View style={styles.actions}>
            <Pressable onPress={() => setDismissed((prev) => new Set(prev).add(summon.fromUid))} hitSlop={6}>
              <ThemedText type="caption" color="muted">
                {t('letters.summonBannerDismiss')}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => router.push(`/letters/compose?to=${summon.fromUid}`)} hitSlop={6}>
              <ThemedText type="caption" color="accentInk" style={styles.sendButton}>
                {t('letters.summonBannerSend')}
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    gap: Spacing.two,
  },
  text: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  sendButton: {
    fontWeight: '700',
  },
});
