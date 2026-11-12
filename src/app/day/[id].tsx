import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { FriendPickerModal } from '@/components/friend-picker-modal';
import { HeaderBackButton } from '@/components/header-back-button';
import { LoadingView } from '@/components/loading-view';
import { PhotoViewerModal } from '@/components/photo-viewer-modal';
import { PrimaryButton } from '@/components/primary-button';
import { ReportModal } from '@/components/report-modal';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { moodIcon, moodLabel, moodOptions } from '@/constants/mood';
import { photoAspectRatioValue, type PhotoAspectKey } from '@/constants/photo-aspect';
import { textAlignOptions } from '@/constants/text-align';
import { DEFAULT_FONT_PRESET, FONT_PRESETS, type FontPresetKey, Radius, Spacing } from '@/constants/theme';
import { visibilityLabel, visibilityOptions } from '@/constants/visibility';
import { useAuth } from '@/context/auth-context';
import { addComment, deleteComment, listComments } from '@/data/comments';
import {
  addToMyHistory,
  ConfirmWindowError,
  confirmDay,
  deleteDay,
  EditWindowClosedError,
  getDay,
  hasLiked,
  isInMyHistory,
  removeFromMyHistory,
  toggleLike,
  updateDay,
  updateDayContent,
} from '@/data/days';
import { listFriends } from '@/data/friends';
import { reportContent } from '@/data/reports';
import { listFriendGroups } from '@/data/users';
import { useDecorativeFonts } from '@/hooks/use-decorative-fonts';
import { useLocale } from '@/hooks/use-locale';
import { useProtectedPhoto } from '@/hooks/use-protected-photo';
import { useTheme } from '@/hooks/use-theme';
import type { CommentDoc, ContentBlock, DayDoc, DayVisibility, MoodKey, TextAlignKey } from '@/types/day';
import type { FriendEntry, FriendGroup, ReportReason } from '@/types/user';
import { confirmAsync, notify } from '@/utils/confirm';
import { formatDayLabelKorean, formatWrittenAtKorean, isFutureLabel, isWritableNow, relativeTimeFromNow } from '@/utils/date';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function isWithinEditWindow(day: Pick<DayDoc, 'createdAt'>): boolean {
  return !!day.createdAt && Date.now() - day.createdAt.toMillis() < EDIT_WINDOW_MS;
}

function DayPhoto({ path, aspect, onPress }: { path: string; aspect: PhotoAspectKey; onPress: () => void }) {
  const source = useProtectedPhoto(path);
  const { width: windowWidth } = useWindowDimensions();
  const width = windowWidth - Spacing.four * 2;
  const height = width / photoAspectRatioValue(aspect);
  return (
    <Pressable onPress={onPress} style={[styles.blockPhoto, { width, height }]}>
      <Image source={source} style={styles.blockPhotoImage} contentFit="cover" />
    </Pressable>
  );
}

function EditPhotoThumb({ path }: { path: string }) {
  const { t } = useLocale();
  const source = useProtectedPhoto(path);
  return (
    <View style={styles.editPhotoThumbWrap}>
      <Image source={source} style={styles.editPhotoThumb} contentFit="cover" />
      <ThemedText type="caption" color="muted">
        {t('dayDetail.editPhotoNotEditable')}
      </ThemedText>
    </View>
  );
}

export default function DayDetailScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  // 이 DAY 작성자가 고른 글씨체(FONT_PRESETS)를 보여주려면 필요한
  // 손글씨체들 — 이 화면에 들어올 때만 받는다(use-decorative-fonts.ts).
  useDecorativeFonts();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigation = useNavigation();

  const [day, setDay] = useState<DayDoc | null>(null);
  const [comments, setComments] = useState<CommentDoc[]>([]);
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const [loadFailed, setLoadFailed] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [pendingVisibility, setPendingVisibility] = useState<DayVisibility>('public');
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const [pendingInWorldFeed, setPendingInWorldFeed] = useState(true);
  const [pendingInHistory, setPendingInHistory] = useState(true);
  const [savingVisibility, setSavingVisibility] = useState(false);

  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBlocks, setEditBlocks] = useState<ContentBlock[]>([]);
  const [editMood, setEditMood] = useState<MoodKey | null>(null);
  const [editFontKey, setEditFontKey] = useState<FontPresetKey>(DEFAULT_FONT_PRESET);
  const [editTextAlign, setEditTextAlign] = useState<TextAlignKey>('left');
  const [savingContent, setSavingContent] = useState(false);

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [pendingTaggedUids, setPendingTaggedUids] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);

  const [confirming, setConfirming] = useState(false);

  const [reportTarget, setReportTarget] = useState<{ type: 'day' | 'comment'; id: string; authorUid: string } | null>(null);
  const [reporting, setReporting] = useState(false);

  const [inMyHistory, setInMyHistory] = useState(false);
  const [togglingHistory, setTogglingHistory] = useState(false);

  const load = useCallback(async () => {
    if (!id || !user) return;
    // 댓글·좋아요도 DAY와 동시에 요청해 둔다. 다만 DAY를 볼 수 없으면(삭제됐거나
    // 공개범위가 바뀜 — getDay가 null) 이 둘도 규칙에서 거부되는데, 그건 오류가 아니라
    // "없는 DAY" 화면을 보여주면 되는 상황이라 그 실패는 버린다.
    const commentsRequest = listComments(id);
    const likedRequest = hasLiked(id, user.uid);
    commentsRequest.catch(() => undefined);
    likedRequest.catch(() => undefined);
    const [dayDoc, linked] = await Promise.all([getDay(id), isInMyHistory(user.uid, id)]);
    setDay(dayDoc);
    setInMyHistory(linked);
    if (!dayDoc) return;
    const [commentList, likedByMe] = await Promise.all([commentsRequest, likedRequest]);
    setComments(commentList);
    setLiked(likedByMe);
  }, [id, user]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setLoadFailed(false);
      load()
        .catch((error) => {
          console.error('DAY를 불러오지 못했어요', error);
          if (active) setLoadFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: day?.title ?? '',
      // 새로고침/딥링크로 이 화면에 바로 들어오면(또는 언어 변경처럼 이 화면
      // 어딘가에서 새로고침이 일어나면) 이동 기록이 없어서 기본 뒤로가기
      // 버튼이 아예 안 뜬다 — 공용 컴포넌트로 항상 직접 그리고, 기록이
      // 없을 땐 홈으로 보낸다.
      headerLeft: () => <HeaderBackButton fallbackHref="/(tabs)" />,
    });
  }, [day, navigation]);

  const isAuthor = !!user && !!day && user.uid === day.authorId;

  function openVisibilityEditor() {
    if (!user || !day) return;
    setPendingVisibility(day.visibility);
    setPendingGroupId(day.groupId);
    setPendingInWorldFeed(day.inWorldFeed);
    setPendingInHistory(day.inHistory);
    setVisibilityModalOpen(true);
    listFriendGroups(user.uid)
      .then(setGroups)
      .catch(() => undefined);
  }

  async function handleSaveVisibility() {
    if (!day) return;
    if (pendingVisibility === 'group' && !pendingGroupId) {
      notify(t('dayDetail.visibilityChangeTitle'), t('dayDetail.visibilityMissingGroup'));
      return;
    }
    setSavingVisibility(true);
    try {
      const groupId = pendingVisibility === 'group' ? pendingGroupId : null;
      const inWorldFeed = pendingVisibility === 'public' && pendingInWorldFeed;
      const patch = { visibility: pendingVisibility, groupId, inWorldFeed, inHistory: pendingInHistory };
      await updateDay(day.id, patch);
      setDay((prev) => (prev ? { ...prev, ...patch } : prev));
      setVisibilityModalOpen(false);
    } catch {
      notify(t('common.error'), t('dayDetail.visibilitySaveFailed'));
    } finally {
      setSavingVisibility(false);
    }
  }

  function openContentEditor() {
    if (!day) return;
    setEditTitle(day.title);
    setEditBlocks(day.contentBlocks.map((b) => ({ ...b })));
    setEditMood(day.moodTag);
    // day.fontKey가 유효한 프리셋 키가 아니면(옛날 데이터 등) 그대로 넣으면
    // 이 화면의 FONT_PRESETS[editFontKey] 참조에서 그대로 죽는다 — ??는
    // null/undefined만 걸러내고 "존재하지만 알 수 없는 값"은 못 걸러낸다.
    setEditFontKey(day.fontKey in FONT_PRESETS ? day.fontKey : DEFAULT_FONT_PRESET);
    setEditTextAlign(day.textAlign ?? 'left');
    setContentModalOpen(true);
  }

  function updateEditBlockText(index: number, text: string) {
    setEditBlocks((prev) => prev.map((b, i) => (i === index && b.type === 'text' ? { type: 'text', text } : b)));
  }

  const canSaveContent = editTitle.trim().length > 0 && editBlocks.some((b) => b.type === 'text' && b.text.trim().length > 0);

  async function handleSaveContent() {
    if (!day || !canSaveContent) return;
    setSavingContent(true);
    try {
      // 사진 블록은 그대로 두고, 텍스트 블록만 다듬는다(빈 텍스트 칸은
      // 저장에서 뺀다 — 사진 인덱스는 photoURLs 배열을 가리키지 텍스트
      // 블록 위치와 무관해서 안전하게 뺄 수 있다).
      const finalBlocks: ContentBlock[] = editBlocks
        .map((b) => (b.type === 'text' ? { type: 'text' as const, text: b.text.trim() } : b))
        .filter((b) => b.type === 'photo' || b.text.length > 0);
      const patch = {
        title: editTitle.trim(),
        contentBlocks: finalBlocks,
        moodTag: editMood,
        fontKey: editFontKey,
        textAlign: editTextAlign,
      };
      await updateDayContent(day, patch);
      setDay((prev) => (prev ? { ...prev, ...patch, editCount: (prev.editCount ?? 0) + 1 } : prev));
      setContentModalOpen(false);
    } catch (error) {
      if (error instanceof EditWindowClosedError) {
        notify(t('dayDetail.editWindowClosedTitle'), error.message);
        setContentModalOpen(false);
      } else {
        notify(t('common.error'), t('dayDetail.editSaveFailed'));
      }
    } finally {
      setSavingContent(false);
    }
  }

  async function handleConfirm() {
    if (!day) return;
    setConfirming(true);
    try {
      await confirmDay(day);
      setDay((prev) => (prev ? { ...prev, status: 'confirmed' } : prev));
    } catch (error) {
      if (error instanceof ConfirmWindowError) {
        notify(t('dayDetail.confirmFailedTitle'), error.message);
      } else {
        notify(t('common.error'), t('dayDetail.confirmFailedGeneric'));
      }
    } finally {
      setConfirming(false);
    }
  }

  async function handleToggleMyHistory() {
    if (!user || !day) return;
    setTogglingHistory(true);
    try {
      if (inMyHistory) {
        await removeFromMyHistory(user.uid, day.id);
        setInMyHistory(false);
      } else {
        await addToMyHistory(user.uid, { id: day.id, authorId: day.authorId });
        setInMyHistory(true);
      }
    } catch {
      notify(t('common.error'), t('dayDetail.myHistoryToggleFailed'));
    } finally {
      setTogglingHistory(false);
    }
  }

  async function handleLike() {
    if (!user || !profile || !day) return;
    setLiked((prev) => !prev);
    setDay((prev) => (prev ? { ...prev, likeCount: prev.likeCount + (liked ? -1 : 1) } : prev));
    try {
      await toggleLike(day.id, { uid: user.uid, nickname: profile.nickname, photoURL: profile.photoURL }, day.authorId, day.title);
    } catch {
      setLiked((prev) => !prev);
      setDay((prev) => (prev ? { ...prev, likeCount: prev.likeCount + (liked ? 1 : -1) } : prev));
    }
  }

  async function handleAddComment() {
    if (!user || !profile || !day || !commentText.trim()) return;
    setSubmittingComment(true);
    try {
      await addComment(day.id, { uid: user.uid, nickname: profile.nickname, photoURL: profile.photoURL }, commentText, day.authorId, day.title);
      setCommentText('');
      await load();
    } catch {
      notify(t('common.error'), t('dayDetail.commentAddFailed'));
    } finally {
      setSubmittingComment(false);
    }
  }

  function openTagEditor() {
    if (!user || !day) return;
    setPendingTaggedUids(day.taggedFriendUids);
    setTagModalOpen(true);
    listFriends(user.uid)
      .then(setFriends)
      .catch(() => undefined);
    listFriendGroups(user.uid)
      .then(setGroups)
      .catch(() => undefined);
  }

  function toggleTaggedFriend(uid: string) {
    setPendingTaggedUids((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));
  }

  async function handleSaveTags() {
    if (!day) return;
    setSavingTags(true);
    try {
      const tagged = friends.filter((f) => pendingTaggedUids.includes(f.friendUid));
      const patch = {
        taggedFriendUids: tagged.map((f) => f.friendUid),
        taggedFriendNicknames: tagged.map((f) => f.nickname),
      };
      await updateDay(day.id, patch);
      setDay((prev) => (prev ? { ...prev, ...patch } : prev));
      setTagModalOpen(false);
    } catch {
      notify(t('common.error'), t('dayDetail.tagSaveFailed'));
    } finally {
      setSavingTags(false);
    }
  }

  async function handleDelete() {
    if (!day) return;
    const ok = await confirmAsync(t('dayDetail.deleteConfirmTitle'), t('dayDetail.deleteConfirmMessage'));
    if (!ok) return;
    try {
      await deleteDay(day.id);
      // 새로고침/딥링크로 이 화면에 곧장 들어왔으면 이동 기록이 없어서
      // back()이 조용히 아무 일도 안 할 수 있다 — 그럴 땐 홈으로.
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch {
      notify(t('common.error'), t('dayDetail.deleteFailed'));
    }
  }

  async function handleReport(reason: ReportReason, detail: string) {
    if (!user || !reportTarget) return;
    setReporting(true);
    try {
      await reportContent(user.uid, {
        targetType: reportTarget.type,
        targetId: reportTarget.id,
        targetAuthorUid: reportTarget.authorUid,
        reason,
        detail,
      });
      setReportTarget(null);
      notify(t('dayDetail.reportSentTitle'), t('dayDetail.reportSentMessage'));
    } catch {
      notify(t('common.error'), t('dayDetail.reportFailed'));
    } finally {
      setReporting(false);
    }
  }

  async function handleDeleteComment(comment: CommentDoc) {
    if (!day) return;
    const ok = await confirmAsync(t('dayDetail.commentDeleteConfirmTitle'), t('dayDetail.commentDeleteConfirmMessage'));
    if (!ok) return;
    try {
      await deleteComment(day.id, comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      setDay((prev) => (prev ? { ...prev, commentCount: Math.max(0, prev.commentCount - 1) } : prev));
    } catch {
      notify(t('common.error'), t('dayDetail.commentDeleteFailed'));
    }
  }

  if (loading) {
    return <LoadingView />;
  }

  if (!day) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex}>
          <EmptyState
            icon="alert-circle-outline"
            title={loadFailed ? t('dayDetail.loadFailedTitle') : t('dayDetail.notFoundTitle')}
            description={loadFailed ? t('dayDetail.loadFailedDescription') : undefined}
          />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <ThemedText type="label" color="accentInk">
                  {formatDayLabelKorean(day.dateLabel)}
                </ThemedText>
                {isAuthor && isWithinEditWindow(day) && (
                  <Pressable onPress={openContentEditor} hitSlop={8}>
                    <Ionicons name="pencil-outline" size={15} color={theme.sub} />
                  </Pressable>
                )}
              </View>
              <ThemedText type="heading">{day.title}</ThemedText>

              {!isAuthor && !!user && day.taggedFriendUids.includes(user.uid) && (
                <Pressable
                  onPress={handleToggleMyHistory}
                  disabled={togglingHistory}
                  style={[styles.myHistoryBanner, { backgroundColor: theme.accentSoft }]}>
                  <Ionicons
                    name={inMyHistory ? 'checkmark-circle' : 'add-circle-outline'}
                    size={17}
                    color={theme.accent}
                  />
                  <ThemedText type="caption" color="accentInk" style={styles.myHistoryBannerText}>
                    {inMyHistory ? t('dayDetail.addedToMyHistory') : t('dayDetail.addToMyHistoryPrompt')}
                  </ThemedText>
                </Pressable>
              )}

              {day.status === 'draft' && isAuthor && (
                <ThemedView surface="card" style={styles.draftBanner}>
                  <Ionicons
                    name={isWritableNow(day.dateLabel) ? 'checkmark-circle-outline' : 'time-outline'}
                    size={15}
                    color={isFutureLabel(day.dateLabel) ? theme.sub : isWritableNow(day.dateLabel) ? theme.accent : theme.danger}
                  />
                  <ThemedText type="caption" color="sub" style={styles.draftBannerText}>
                    {isFutureLabel(day.dateLabel)
                      ? t('dayDetail.draftFuture')
                      : isWritableNow(day.dateLabel)
                        ? t('dayDetail.draftDueToday')
                        : t('dayDetail.draftExpired')}
                  </ThemedText>
                  {!isFutureLabel(day.dateLabel) && isWritableNow(day.dateLabel) && (
                    <PrimaryButton label={t('dayDetail.confirm')} onPress={handleConfirm} loading={confirming} style={styles.draftConfirmButton} />
                  )}
                </ThemedView>
              )}

              {isAuthor && (
                day.status === 'confirmed' ? (
                  <Pressable
                    style={[styles.visibilityRow, { backgroundColor: theme.card }]}
                    onPress={openVisibilityEditor}>
                    <Ionicons name="eye-outline" size={13} color={theme.sub} />
                    <ThemedText type="caption" color="sub">
                      {visibilityLabel(day.visibility)}
                    </ThemedText>
                    <Ionicons name="chevron-down" size={13} color={theme.muted} />
                  </Pressable>
                ) : (
                  <View style={[styles.visibilityRow, { backgroundColor: theme.card }]}>
                    <Ionicons name="lock-closed-outline" size={13} color={theme.sub} />
                    <ThemedText type="caption" color="sub">
                      {/* 기한이 지나 영영 확정할 수 없는 예정 DAY에 "확정 후 변경 가능"은 맞지 않다. */}
                      {isFutureLabel(day.dateLabel) || isWritableNow(day.dateLabel)
                        ? t('dayDetail.privateUntilConfirmed')
                        : visibilityLabel('private')}
                    </ThemedText>
                  </View>
                )
              )}

              <View style={styles.authorRow}>
                <Pressable
                  style={styles.authorMain}
                  onPress={() => router.push({ pathname: '/profile', params: { uid: day.authorId } })}>
                  <Avatar uri={day.authorPhotoURL} size={36} />
                  <View>
                    <ThemedText type="label">{day.authorNickname}</ThemedText>
                    <ThemedText type="caption" color="sub">
                      {t('dayDetail.writtenAt', { date: formatWrittenAtKorean(day.createdAt) })}
                      {day.editCount > 0 ? t('dayDetail.editedCount', { count: day.editCount }) : ''}
                    </ThemedText>
                  </View>
                </Pressable>
                {day.moodTag && (
                  <View style={[styles.moodChip, { backgroundColor: theme.accentSoft }]}>
                    <Ionicons name={moodIcon(day.moodTag)} size={13} color={theme.accent} />
                    <ThemedText type="caption" color="accentInk">
                      {moodLabel(day.moodTag)}
                    </ThemedText>
                  </View>
                )}
              </View>

              <View style={styles.blocksContainer}>
                {day.contentBlocks.map((block, i) =>
                  block.type === 'text' ? (
                    <ThemedText
                      key={`text-${i}`}
                      type="body"
                      style={[
                        styles.bodyText,
                        {
                          // day.fontKey는 Firestore 규칙으로 유효한 프리셋 키만 저장되게
                          // 막아뒀지만(days create/update 규칙 참고), 방어적으로 한 번 더
                          // 감싼다 — 여기서 못 찾는 값이면 undefined.sans에서 그대로
                          // 죽어서 이 DAY를 보는 모든 사람의 화면이 깨지기 때문이다.
                          fontFamily: (FONT_PRESETS[day.fontKey] ?? FONT_PRESETS[DEFAULT_FONT_PRESET]).sans,
                          textAlign: day.textAlign ?? 'left',
                        },
                      ]}>
                      {block.text}
                    </ThemedText>
                  ) : (
                    <DayPhoto
                      key={`photo-${i}`}
                      path={day.photoURLs[block.photoIndex]}
                      aspect={day.photoAspects?.[block.photoIndex] ?? 'landscape'}
                      onPress={() => setViewerIndex(block.photoIndex)}
                    />
                  )
                )}
              </View>

              {day.location && (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color={theme.sub} />
                  <ThemedText type="caption" color="sub">
                    {day.location.name}
                  </ThemedText>
                </View>
              )}

              {(day.taggedFriendNicknames.length > 0 || isAuthor) && (
                <View style={styles.taggedBlock}>
                  <Pressable
                    style={styles.taggedHeaderRow}
                    onPress={isAuthor ? openTagEditor : undefined}
                    disabled={!isAuthor}>
                    <ThemedText type="caption" color="sub">
                      {t('dayDetail.together')}
                    </ThemedText>
                    {isAuthor && <Ionicons name="pencil-outline" size={13} color={theme.sub} />}
                  </Pressable>
                  {day.taggedFriendNicknames.length > 0 && (
                    <View style={styles.taggedRow}>
                      {day.taggedFriendNicknames.map((name) => (
                        <View key={name} style={[styles.taggedChip, { backgroundColor: theme.surface, borderColor: theme.line }]}>
                          <ThemedText type="caption">{name}</ThemedText>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <View style={[styles.interactionRow, { borderColor: theme.line }]}>
                {day.status === 'confirmed' && (
                  <Pressable style={styles.interactionItem} onPress={handleLike}>
                    <Ionicons name={liked ? 'heart' : 'heart-outline'} size={19} color={liked ? theme.accent : theme.sub} />
                    <ThemedText type="caption">{day.likeCount}</ThemedText>
                  </Pressable>
                )}
                {day.status === 'confirmed' && (
                  <View style={styles.interactionItem}>
                    <Ionicons name="chatbubble-outline" size={18} color={theme.sub} />
                    {/* 이 화면은 댓글을 전부 불러오니 보이는 개수를 그대로 쓴다 — commentCount는
                        서버가 나중에 다시 세는 값이라, 방금 달거나 지운 직후엔 목록과 어긋났다. */}
                    <ThemedText type="caption">{comments.length}</ThemedText>
                  </View>
                )}
                {isAuthor ? (
                  <Pressable style={styles.interactionItem} onPress={handleDelete}>
                    <Ionicons name="trash-outline" size={17} color={theme.danger} />
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.interactionItem}
                    onPress={() => day && setReportTarget({ type: 'day', id: day.id, authorUid: day.authorId })}>
                    <Ionicons name="flag-outline" size={17} color={theme.sub} />
                  </Pressable>
                )}
              </View>

              <View style={styles.commentsBlock}>
                {comments.map((comment) => (
                  <View key={comment.id} style={styles.commentRow}>
                    <Pressable
                      style={styles.commentRowMain}
                      onPress={() => router.push({ pathname: '/profile', params: { uid: comment.authorId } })}>
                      <Avatar uri={comment.authorPhotoURL} size={30} />
                      <View style={styles.commentTextBlock}>
                        <View style={styles.commentHeader}>
                          <ThemedText type="label">{comment.authorNickname}</ThemedText>
                          <ThemedText type="caption" color="muted">
                            {relativeTimeFromNow(comment.createdAt)}
                          </ThemedText>
                        </View>
                        <ThemedText type="caption" color="sub">
                          {comment.body}
                        </ThemedText>
                      </View>
                    </Pressable>
                    <View style={styles.commentActions}>
                      {/* 내 댓글이거나, 내 DAY에 달린 댓글이면 지울 수 있다. */}
                      {(user?.uid === comment.authorId || isAuthor) && (
                        <Pressable
                          onPress={() => handleDeleteComment(comment)}
                          hitSlop={8}
                          accessibilityLabel={t('dayDetail.commentDelete')}>
                          <Ionicons name="trash-outline" size={15} color={theme.muted} />
                        </Pressable>
                      )}
                      {user?.uid !== comment.authorId && (
                        <Pressable
                          onPress={() => setReportTarget({ type: 'comment', id: comment.id, authorUid: comment.authorId })}
                          hitSlop={8}
                          accessibilityLabel={t('dayDetail.report')}>
                          <Ionicons name="flag-outline" size={15} color={theme.muted} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          {day.status === 'confirmed' && (
            <View style={[styles.commentInputRow, { borderColor: theme.line, backgroundColor: theme.surface }]}>
              <View style={styles.commentInputField}>
                <FormField value={commentText} onChangeText={setCommentText} placeholder={t('dayDetail.commentPlaceholder')} maxLength={1000} />
              </View>
              <Pressable
                onPress={handleAddComment}
                disabled={!commentText.trim() || submittingComment}
                style={[styles.sendButton, { backgroundColor: theme.accent, opacity: commentText.trim() ? 1 : 0.5 }]}>
                <Ionicons name="send" size={16} color={theme.onAccent} />
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <PhotoViewerModal
        visible={viewerIndex !== null}
        photos={day.photoURLs}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />

      <Modal visible={visibilityModalOpen} animationType="slide" transparent onRequestClose={() => setVisibilityModalOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisibilityModalOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <ThemedText type="label">{t('dayDetail.visibilityChangeTitle')}</ThemedText>
            <Segmented value={pendingVisibility} onChange={setPendingVisibility} options={visibilityOptions()} />
            {pendingVisibility === 'group' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sheetGroupRow}>
                {groups.length === 0 ? (
                  <ThemedText type="caption" color="muted">
                    {t('write.pickGroupHint')}
                  </ThemedText>
                ) : (
                  groups.map((g) => (
                    <Pressable
                      key={g.id}
                      onPress={() => setPendingGroupId(g.id)}
                      style={[
                        styles.sheetGroupChip,
                        pendingGroupId === g.id
                          ? { backgroundColor: theme.accent }
                          : { backgroundColor: theme.card },
                      ]}>
                      <ThemedText type="caption" color={pendingGroupId === g.id ? 'onAccent' : 'sub'}>
                        {g.name}
                      </ThemedText>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            )}
            {pendingVisibility === 'public' && (
              <View style={styles.toggleRow}>
                <ThemedText type="body">{t('write.toggleWorldFeed')}</ThemedText>
                <Switch
                  value={pendingInWorldFeed}
                  onValueChange={setPendingInWorldFeed}
                  trackColor={{ true: theme.accent, false: theme.card }}
                />
              </View>
            )}
            <View style={styles.toggleRow}>
              <ThemedText type="body">{t('write.toggleHistory')}</ThemedText>
              <Switch
                value={pendingInHistory}
                onValueChange={setPendingInHistory}
                trackColor={{ true: theme.accent, false: theme.card }}
              />
            </View>
            <PrimaryButton label={t('dayDetail.save')} onPress={handleSaveVisibility} loading={savingVisibility} style={styles.sheetSave} />
          </View>
        </View>
      </Modal>

      <Modal visible={contentModalOpen} animationType="slide" transparent onRequestClose={() => setContentModalOpen(false)}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheetBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setContentModalOpen(false)} />
            <ScrollView style={[styles.editSheet, { backgroundColor: theme.surface }]} contentContainerStyle={styles.editSheetContent}>
              <ThemedText type="label">{t('dayDetail.editTitle')}</ThemedText>
              <ThemedText type="caption" color="muted">
                {t('dayDetail.editHint')}
              </ThemedText>
              <FormField
                label={t('dayDetail.titleLabel')}
                value={editTitle}
                onChangeText={setEditTitle}
                maxLength={40}
              />
              <ThemedText type="label">{t('dayDetail.editContentLabel')}</ThemedText>
              <View style={styles.editBlockList}>
                {editBlocks.map((block, i) =>
                  block.type === 'text' ? (
                    <FormField
                      key={`edit-text-${i}`}
                      value={block.text}
                      onChangeText={(text) => updateEditBlockText(i, text)}
                      multiline
                      numberOfLines={4}
                      fontFamily={FONT_PRESETS[editFontKey].sans}
                      style={{ textAlign: editTextAlign }}
                    />
                  ) : (
                    <EditPhotoThumb key={`edit-photo-${i}`} path={day.photoURLs[block.photoIndex]} />
                  )
                )}
              </View>
              <ThemedText type="label">{t('dayDetail.editSectionAlign')}</ThemedText>
              <Segmented value={editTextAlign} onChange={setEditTextAlign} options={textAlignOptions()} />
              <ThemedText type="label">{t('dayDetail.editSectionFont')}</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {(Object.keys(FONT_PRESETS) as FontPresetKey[]).map((key) => {
                  const active = editFontKey === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setEditFontKey(key)}
                      style={[
                        styles.sheetGroupChip,
                        active ? { backgroundColor: theme.accent } : { backgroundColor: theme.card },
                      ]}>
                      <ThemedText
                        type="body"
                        color={active ? 'onAccent' : 'ink'}
                        style={{ fontFamily: FONT_PRESETS[key].serifBold }}>
                        {FONT_PRESETS[key].label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.moodRow}>
                {moodOptions().map((m) => {
                  const active = editMood === m.key;
                  return (
                    <Pressable key={m.key} onPress={() => setEditMood(active ? null : m.key)} style={styles.moodItem}>
                      <View
                        style={[
                          styles.moodCircle,
                          { backgroundColor: active ? theme.accentSoft : theme.card },
                          active && { borderWidth: 1.5, borderColor: theme.accent },
                        ]}>
                        <Ionicons name={m.icon} size={18} color={active ? theme.accent : theme.muted} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <PrimaryButton
                label={t('dayDetail.save')}
                onPress={handleSaveContent}
                loading={savingContent}
                disabled={!canSaveContent}
                style={styles.sheetSave}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <FriendPickerModal
        visible={tagModalOpen}
        title={t('dayDetail.together')}
        friends={friends}
        groups={groups}
        selectedUids={pendingTaggedUids}
        onToggle={toggleTaggedFriend}
        onClose={() => setTagModalOpen(false)}
        onConfirm={handleSaveTags}
        confirmLoading={savingTags}
      />

      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        onSubmit={handleReport}
        submitting={reporting}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingBottom: Spacing.six,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  editSheet: {
    maxHeight: '80%',
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
  },
  editSheetContent: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  moodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.three,
    columnGap: Spacing.three,
  },
  moodItem: {
    alignItems: 'center',
  },
  moodCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myHistoryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    marginTop: Spacing.two,
  },
  myHistoryBannerText: {
    flex: 1,
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    marginTop: Spacing.two,
    flexWrap: 'wrap',
  },
  draftBannerText: {
    flex: 1,
    minWidth: 150,
  },
  draftConfirmButton: {
    paddingHorizontal: Spacing.three,
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    marginTop: Spacing.one,
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
  sheetGroupRow: {
    flexGrow: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  sheetGroupChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    marginRight: Spacing.two,
  },
  sheetSave: {
    marginTop: Spacing.one,
  },
  body: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  blocksContainer: {
    marginTop: Spacing.one,
    gap: Spacing.three,
  },
  blockPhoto: {
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  blockPhotoImage: {
    width: '100%',
    height: '100%',
  },
  editBlockList: {
    gap: Spacing.three,
  },
  editPhotoThumbWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  editPhotoThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.medium,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
  authorMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  bodyText: {
    marginTop: Spacing.one,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: Spacing.one,
  },
  taggedBlock: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  taggedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  taggedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  taggedChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  interactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.five,
    paddingVertical: Spacing.three,
    marginTop: Spacing.three,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  interactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commentsBlock: {
    marginTop: Spacing.three,
    gap: Spacing.three,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  commentRowMain: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  commentTextBlock: {
    flex: 1,
    gap: 3,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: 2,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: 1,
  },
  commentInputField: {
    flex: 1,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
