import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';

export type UpdatedFriend = { uid: string; nickname: string; photoURL: string | null; latestMs: number; unseen: boolean };

/**
 * 내 연혁 위의 "업데이트한 친구 N" — 최근 연혁에 새 DAY를 올린 친구들을 가로로
 * 보여주고, 아직 안 본 업데이트엔 점을 찍는다(카카오톡 친구탭의 "업데이트한
 * 친구"처럼). 누르면 그 친구의 연혁으로 간다.
 */
export function UpdatedFriendsStrip({ friends, onPress }: { friends: UpdatedFriend[]; onPress: (uid: string) => void }) {
  const theme = useTheme();
  const { t } = useLocale();
  if (friends.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ThemedText type="label" color="sub">
        {t('history.updatedFriends')} <ThemedText type="label" color="muted">{friends.length}</ThemedText>
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {friends.map((f) => (
          <Pressable
            key={f.uid}
            onPress={() => onPress(f.uid)}
            style={styles.item}
            accessibilityRole="button"
            accessibilityLabel={f.unseen ? t('history.updatedFriendNew', { nickname: f.nickname }) : f.nickname}>
            <View>
              <Avatar uri={f.photoURL} size={54} />
              {f.unseen && <View style={[styles.dot, { backgroundColor: theme.accent, borderColor: theme.background }]} />}
            </View>
            <ThemedText type="caption" numberOfLines={1} style={styles.name}>
              {f.nickname}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.three,
    paddingRight: Spacing.two,
  },
  item: {
    width: 60,
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  name: {
    maxWidth: 60,
    textAlign: 'center',
  },
});
