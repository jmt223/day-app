import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { LoadingView } from '@/components/loading-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { deleteComment, listMyCommentsPage } from '@/data/comments';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { MyCommentEntry } from '@/types/day';
import { confirmAsync, notify } from '@/utils/confirm';
import { relativeTimeFromNow } from '@/utils/date';

const PAGE_SIZE = 20;

export default function MyCommentsScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user } = useAuth();

  const [comments, setComments] = useState<MyCommentEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      setLoading(true);
      setLoadError(null);
      listMyCommentsPage(user.uid, PAGE_SIZE)
        .then((page) => {
          if (!active) return;
          setComments(page.comments);
          setCursor(page.nextCursor);
          setHasMore(!!page.nextCursor);
        })
        .catch((error) => {
          console.error('내 댓글을 불러오지 못했어요', error);
          if (active) setLoadError(error?.message ?? t('common.unknownError'));
        })
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])
  );

  async function loadMore() {
    if (!user || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await listMyCommentsPage(user.uid, PAGE_SIZE, cursor);
      setComments((prev) => [...prev, ...page.comments]);
      setCursor(page.nextCursor);
      setHasMore(!!page.nextCursor);
    } catch (error) {
      console.error('다음 페이지를 불러오지 못했어요', error);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDelete(entry: MyCommentEntry) {
    if (!user) return;
    const ok = await confirmAsync(t('dayDetail.commentDeleteConfirmTitle'), t('dayDetail.commentDeleteConfirmMessage'));
    if (!ok) return;
    setDeletingId(entry.commentId);
    try {
      await deleteComment(entry.dayId, entry.commentId);
      setComments((prev) => prev.filter((c) => c.commentId !== entry.commentId));
    } catch {
      notify(t('common.error'), t('myComments.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <LoadingView />;

  return (
    <ThemedView style={styles.flex}>
      {loadError ? (
        <EmptyState icon="alert-circle-outline" title={t('common.loadErrorTitle')} description={loadError} />
      ) : comments.length === 0 ? (
        <EmptyState icon="chatbubble-outline" title={t('myComments.emptyTitle')} description={t('myComments.emptyDescription')} />
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item) => item.commentId}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: theme.line }]}>
              <Pressable style={styles.rowMain} onPress={() => router.push(`/day/${item.dayId}`)}>
                <ThemedText type="body" numberOfLines={2}>
                  {item.body}
                </ThemedText>
                <ThemedText type="caption" color="muted" numberOfLines={1}>
                  {t('myComments.postedOn', { dayTitle: item.dayTitle })} · {relativeTimeFromNow(item.createdAt)}
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => handleDelete(item)} disabled={deletingId === item.commentId} hitSlop={8}>
                {deletingId === item.commentId ? (
                  <ActivityIndicator size="small" color={theme.muted} />
                ) : (
                  <Ionicons name="trash-outline" size={18} color={theme.muted} />
                )}
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : null
          }
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
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  footer: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
});
