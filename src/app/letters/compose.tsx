import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { LoadingView } from '@/components/loading-view';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listFriends } from '@/data/friends';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { FriendEntry } from '@/types/user';

/**
 * 새 편지 — 받을 친구를 고르면 그 친구와의 대화창으로 넘어간다(펫 고르기·
 * 대기시간·본문 쓰기는 대화창 아래쪽에서 한다). ?to=uid로 들어오면 바로 넘긴다.
 */
export default function ComposeLetterScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user } = useAuth();
  const { to } = useLocalSearchParams<{ to?: string }>();
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);

  useEffect(() => {
    if (to) router.replace({ pathname: '/letters/with/[uid]', params: { uid: to } });
  }, [to]);

  useFocusEffect(
    useCallback(() => {
      if (!user || to) return;
      let active = true;
      listFriends(user.uid)
        .then((list) => active && setFriends(list))
        .catch((error) => {
          console.error('친구 목록을 불러오지 못했어요', error);
          if (active) setFriends([]);
        });
      return () => {
        active = false;
      };
    }, [user, to])
  );

  if (to || friends === null) return <LoadingView />;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="label" color="sub">
          {t('letters.compose.selectFriend')}
        </ThemedText>
        {friends.length === 0 ? (
          <>
            <EmptyState icon="people-outline" title={t('letters.compose.noFriends')} />
            <PrimaryButton label={t('letters.compose.goToFriends')} variant="outline" onPress={() => router.push('/(tabs)/friends')} />
          </>
        ) : (
          friends.map((f) => (
            <Pressable
              key={f.friendUid}
              style={[styles.friendRow, { borderColor: theme.line, backgroundColor: theme.surface }]}
              onPress={() => router.replace({ pathname: '/letters/with/[uid]', params: { uid: f.friendUid } })}>
              <Avatar uri={f.photoURL} size={40} />
              <ThemedText type="body" style={styles.flex}>
                {f.nickname}
              </ThemedText>
              <ThemedText type="caption" color="muted">
                {f.groupName}
              </ThemedText>
            </Pressable>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.two,
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
});
