import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { LoadingView } from '@/components/loading-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { listBlockedUsers, unblockUser } from '@/data/blocks';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { BlockedUser } from '@/types/user';
import { notify } from '@/utils/confirm';
import { friendlyErrorMessage } from '@/utils/error-message';

export default function BlockedUsersScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user } = useAuth();
  const [items, setItems] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      setLoading(true);
      setLoadError(null);
      listBlockedUsers(user.uid)
        .then((list) => active && setItems(list))
        .catch((error) => {
          console.error('차단 목록을 불러오지 못했어요', error);
          if (active) setLoadError(friendlyErrorMessage(error));
        })
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [user])
  );

  async function handleUnblock(blockedUid: string) {
    if (!user) return;
    try {
      await unblockUser(user.uid, blockedUid);
      setItems((prev) => prev.filter((b) => b.blockedUid !== blockedUid));
    } catch {
      notify(t('common.error'), t('blocked.unblockFailed'));
    }
  }

  if (loading) return <LoadingView />;

  return (
    <ThemedView style={styles.flex}>
      {loadError ? (
        <EmptyState icon="alert-circle-outline" title={t('common.loadErrorTitle')} description={loadError} />
      ) : items.length === 0 ? (
        <EmptyState icon="ban-outline" title={t('blocked.emptyTitle')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.blockedUid}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: theme.line }]}>
              <ThemedText type="body">{item.blockedNickname}</ThemedText>
              <Pressable onPress={() => handleUnblock(item.blockedUid)}>
                <ThemedText type="caption" color="accentInk">
                  {t('blocked.unblock')}
                </ThemedText>
              </Pressable>
            </View>
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
});
