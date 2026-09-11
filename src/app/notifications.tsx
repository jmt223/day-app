import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { LoadingView } from '@/components/loading-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { deleteNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from '@/data/notifications';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { AppNotification, NotificationType } from '@/types/user';
import { confirmAsync, notify } from '@/utils/confirm';
import { relativeTimeFromNow } from '@/utils/date';

const ICONS: Record<NotificationType, keyof typeof import('@expo/vector-icons/Ionicons').default.glyphMap> = {
  tag: 'person-add-outline',
  comment: 'chatbubble-outline',
  like: 'heart-outline',
  friend_request: 'person-add-outline',
  friend_accept: 'checkmark-circle-outline',
  memory: 'time-outline',
  letter_received: 'mail-outline',
  letter_replied: 'mail-open-outline',
  letter_expired: 'time-outline',
  pet_summon: 'paw-outline',
};

function messageFor(notification: AppNotification, t: ReturnType<typeof useLocale>['t']): string {
  switch (notification.type) {
    case 'tag':
      return t('notifications.tag', { nickname: notification.fromNickname, dayTitle: notification.dayTitle ?? '' });
    case 'comment':
      return t('notifications.comment', { nickname: notification.fromNickname, dayTitle: notification.dayTitle ?? '' });
    case 'like':
      return t('notifications.like', { nickname: notification.fromNickname, dayTitle: notification.dayTitle ?? '' });
    case 'friend_request':
      return t('notifications.friendRequest', { nickname: notification.fromNickname });
    case 'friend_accept':
      return t('notifications.friendAccept', { nickname: notification.fromNickname });
    case 'memory':
      return t('notifications.memory', { years: notification.yearsAgo ?? 1, dayTitle: notification.dayTitle ?? '' });
    case 'letter_received':
      return t('notifications.letterReceived', { nickname: notification.fromNickname });
    case 'letter_replied':
      return t('notifications.letterReplied', { nickname: notification.fromNickname });
    case 'letter_expired':
      return t('notifications.letterExpired', { nickname: notification.fromNickname });
    case 'pet_summon':
      return t('notifications.petSummon', { nickname: notification.fromNickname });
  }
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user } = useAuth();
  const navigation = useNavigation();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      setLoading(true);
      setLoadError(null);
      listNotifications(user.uid)
        .then((list) => active && setItems(list))
        .catch((error) => {
          console.error('알림을 불러오지 못했어요', error);
          if (active) setLoadError(error?.message ?? t('common.unknownError'));
        })
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])
  );

  const hasUnread = items.some((n) => !n.read);

  async function handleMarkAllRead() {
    if (!user || !hasUnread) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(user.uid);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      notify(t('common.error'), t('notifications.markAllReadFailed'));
    } finally {
      setMarkingAll(false);
    }
  }

  // "모두 읽음"은 안 읽은 알림이 있을 때만 뜻이 있고, 화면 안 목록 상태(items)에
  // 따라 매번 달라져야 해서 _layout.tsx의 고정 옵션이 아니라 이 화면이 직접
  // 헤더 오른쪽 버튼을 그린다 — day/[id]의 동적 헤더와 같은 방식.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        hasUnread ? (
          <Pressable onPress={handleMarkAllRead} disabled={markingAll} hitSlop={8} style={styles.markAllButton}>
            <ThemedText type="caption" color="accentInk">
              {t('notifications.markAllRead')}
            </ThemedText>
          </Pressable>
        ) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, hasUnread, markingAll]);

  async function handleDelete(notification: AppNotification) {
    if (!user) return;
    const ok = await confirmAsync(t('notifications.deleteConfirmTitle'), t('notifications.deleteConfirmMessage'));
    if (!ok) return;
    try {
      await deleteNotification(user.uid, notification.id);
      setItems((prev) => prev.filter((n) => n.id !== notification.id));
    } catch {
      notify(t('common.error'), t('notifications.deleteFailed'));
    }
  }

  async function handlePress(notification: AppNotification) {
    if (!user) return;
    if (!notification.read) {
      try {
        await markNotificationRead(user.uid, notification.id);
        setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      } catch {
        // 읽음 처리는 실패해도 화면 이동은 막지 않는다 — 다음에 목록을 다시
        // 열면 서버 값 그대로 다시 보이니 조용히 넘어간다.
      }
    }
    if (notification.type === 'friend_request') {
      router.push('/(tabs)/friends');
    } else if (notification.type === 'friend_accept') {
      router.push({ pathname: '/profile', params: { uid: notification.fromUid } });
    } else if (notification.type === 'pet_summon') {
      router.push('/(tabs)/letters');
    } else if (notification.letterId) {
      router.push(`/letters/${notification.letterId}`);
    } else if (notification.dayId) {
      router.push(`/day/${notification.dayId}`);
    }
  }

  if (loading) return <LoadingView />;

  return (
    <ThemedView style={styles.flex}>
      {loadError ? (
        <EmptyState icon="alert-circle-outline" title={t('notifications.loadFailed')} description={loadError} />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications-outline" title={t('notifications.emptyTitle')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: theme.line }, !item.read && { backgroundColor: theme.accentSoft }]}>
              <Pressable style={styles.rowMain} onPress={() => handlePress(item)}>
                <ThemedView surface="card" style={styles.iconWrap}>
                  <Ionicons name={ICONS[item.type]} size={16} color={theme.accent} />
                </ThemedView>
                <View style={styles.textBlock}>
                  <ThemedText type="body">{messageFor(item, t)}</ThemedText>
                  <ThemedText type="caption" color="muted">
                    {relativeTimeFromNow(item.createdAt)}
                  </ThemedText>
                </View>
              </Pressable>
              <Pressable onPress={() => handleDelete(item)} hitSlop={8}>
                <Ionicons name="trash-outline" size={16} color={theme.muted} />
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
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 14,
    borderWidth: 1,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.three,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  markAllButton: {
    paddingHorizontal: Spacing.two,
  },
});
