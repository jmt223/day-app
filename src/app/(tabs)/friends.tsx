import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  acceptFriendRequest,
  declineFriendRequest,
  FriendLookupError,
  listFriends,
  listIncomingFriendRequests,
  moveFriendToGroup,
  removeFriend,
  sendFriendRequest,
} from '@/data/friends';
import { createFriendGroup, deleteFriendGroup, GroupNotEmptyError, listFriendGroups, renameFriendGroup } from '@/data/users';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { FriendEntry, FriendGroup, FriendRequest } from '@/types/user';
import { confirmAsync, notify } from '@/utils/confirm';

export default function FriendsScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user, profile } = useAuth();

  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [addEmail, setAddEmail] = useState('');
  const [addGroupId, setAddGroupId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [acceptTarget, setAcceptTarget] = useState<FriendRequest | null>(null);
  const [acceptGroupId, setAcceptGroupId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const [moveTarget, setMoveTarget] = useState<FriendEntry | null>(null);
  const [moveGroupId, setMoveGroupId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const [renameTarget, setRenameTarget] = useState<FriendGroup | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [groupList, friendList, requestList] = await Promise.all([
      listFriendGroups(user.uid),
      listFriends(user.uid),
      listIncomingFriendRequests(user.uid),
    ]);
    setGroups(groupList);
    setFriends(friendList);
    setRequests(requestList);
    setAddGroupId((prev) => prev ?? groupList[0]?.id ?? null);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setLoadError(null);
      load()
        .catch((error) => {
          console.error('친구/그룹을 불러오지 못했어요', error);
          if (active) setLoadError(error?.message ?? t('common.unknownError'));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
      // t는 언어가 바뀔 때마다 새 함수 참조가 되는데, 여기 의존성에 넣으면
      // (네이티브에서) 언어를 바꿀 때마다 친구/그룹을 불필요하게 다시
      // 통째로 불러오게 된다 — 에러 메시지 번역 하나 때문에 감수할 비용이
      // 아니라서 뺀다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await load();
      setLoadError(null);
    } catch (error) {
      console.error('친구/그룹을 불러오지 못했어요', error);
      setLoadError((error as { message?: string })?.message ?? t('common.unknownError'));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCreateGroup() {
    if (!user || !newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      await createFriendGroup(user.uid, newGroupName.trim());
      setNewGroupName('');
      await load();
    } catch {
      notify(t('common.error'), t('friends.createGroupFailed'));
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleSendRequest() {
    if (!user || !profile || !addEmail.trim() || !addGroupId) return;
    const group = groups.find((g) => g.id === addGroupId);
    if (!group) return;
    setSending(true);
    try {
      await sendFriendRequest(
        { uid: user.uid, nickname: profile.nickname, photoURL: profile.photoURL },
        addEmail.trim(),
        group.id,
        group.name
      );
      setAddEmail('');
      notify(t('friends.requestSentTitle'), t('friends.requestSentMessage'));
    } catch (error) {
      if (error instanceof FriendLookupError) {
        notify(t('common.error'), error.message);
      } else {
        notify(t('common.error'), t('friends.requestFailed'));
      }
    } finally {
      setSending(false);
    }
  }

  function openAcceptModal(request: FriendRequest) {
    setAcceptTarget(request);
    setAcceptGroupId(groups[0]?.id ?? null);
  }

  async function handleAccept() {
    if (!user || !profile || !acceptTarget || !acceptGroupId) return;
    const group = groups.find((g) => g.id === acceptGroupId);
    if (!group) return;
    setAccepting(true);
    try {
      await acceptFriendRequest(
        { uid: user.uid, nickname: profile.nickname, photoURL: profile.photoURL },
        acceptTarget,
        group.id,
        group.name
      );
      setAcceptTarget(null);
      await load();
    } catch {
      notify(t('common.error'), t('friends.acceptFailed'));
    } finally {
      setAccepting(false);
    }
  }

  async function handleDecline(request: FriendRequest) {
    if (!user) return;
    try {
      await declineFriendRequest(user.uid, request.fromUid);
    } catch {
      notify(t('common.error'), t('friends.declineFailed'));
    }
    load().catch(() => undefined);
  }

  async function handleRemove(friendUid: string) {
    if (!user) return;
    const ok = await confirmAsync(t('friends.removeConfirmTitle'), t('friends.removeConfirmMessage'));
    if (!ok) return;
    try {
      await removeFriend(user.uid, friendUid);
    } catch {
      notify(t('common.error'), t('friends.removeFailed'));
    }
    load().catch(() => undefined);
  }

  function openMoveModal(friend: FriendEntry) {
    setMoveTarget(friend);
    setMoveGroupId(friend.groupId);
  }

  async function handleMove() {
    if (!user || !moveTarget || !moveGroupId) return;
    const group = groups.find((g) => g.id === moveGroupId);
    if (!group) return;
    setMoving(true);
    try {
      await moveFriendToGroup(user.uid, moveTarget.friendUid, group.id, group.name);
      setMoveTarget(null);
      await load();
    } catch {
      notify(t('common.error'), t('friends.moveFailed'));
    } finally {
      setMoving(false);
    }
  }

  function goToFriendHistory(friendUid: string) {
    router.push({ pathname: '/(tabs)/history', params: { friendUid } });
  }

  // 친구의 프로필로 들어가야(신고하기/차단하기가 거기 있다) 이미 추가한
  // 친구를 차단할 수 있다 — 예전엔 이 목록에서 친구를 누르면 곧장 연혁으로
  // 넘어가버려서, DAY나 댓글에 남긴 이름을 통해 우회해서 들어가지 않는 한
  // 친구 목록에서 직접 프로필로 갈 방법이 없었다.
  function goToFriendProfile(friendUid: string) {
    router.push({ pathname: '/profile', params: { uid: friendUid } });
  }

  function openRenameModal(group: FriendGroup) {
    setRenameTarget(group);
    setRenameValue(group.name);
  }

  async function handleRename() {
    if (!user || !renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    try {
      await renameFriendGroup(user.uid, renameTarget.id, renameValue.trim());
      setRenameTarget(null);
      await load();
    } catch {
      notify(t('common.error'), t('friends.renameGroupFailed'));
    } finally {
      setRenaming(false);
    }
  }

  async function handleDeleteGroup(group: FriendGroup) {
    if (!user) return;
    const ok = await confirmAsync(t('friends.deleteGroupConfirmTitle'), t('friends.deleteGroupConfirmMessage', { name: group.name }));
    if (!ok) return;
    try {
      await deleteFriendGroup(user.uid, group.id);
      setAddGroupId((prev) => (prev === group.id ? null : prev));
      await load();
    } catch (error) {
      if (error instanceof GroupNotEmptyError) {
        notify(t('friends.deleteGroupNotAllowedTitle'), error.message);
      } else {
        notify(t('common.error'), t('friends.deleteGroupFailed'));
      }
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}>
          <View style={styles.titleRow}>
            <ThemedText type="title">{t('friends.title')}</ThemedText>
            <Pressable onPress={handleRefresh} disabled={refreshing} hitSlop={8}>
              {refreshing ? (
                <ActivityIndicator size="small" color={theme.sub} />
              ) : (
                <Ionicons name="refresh-outline" size={21} color={theme.sub} />
              )}
            </Pressable>
          </View>

          {loadError && (
            <ThemedView surface="card" style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
              <ThemedText type="caption" color="danger" style={styles.errorText}>
                {t('common.loadErrorBanner', { message: loadError })}
              </ThemedText>
            </ThemedView>
          )}

          {requests.length > 0 && (
            <ThemedView surface="surface" style={[styles.card, { borderColor: theme.line }]}>
              <ThemedText type="label" color="sub">
                {t('friends.incomingRequests')}
              </ThemedText>
              {requests.map((request) => (
                <View key={request.fromUid} style={[styles.friendRow, { borderColor: theme.line }]}>
                  <Pressable style={styles.friendRowMain} onPress={() => goToFriendProfile(request.fromUid)}>
                    <Avatar uri={request.fromPhotoURL} size={38} />
                    <ThemedText type="body">{request.fromNickname}</ThemedText>
                  </Pressable>
                  <View style={styles.requestActions}>
                    <Pressable
                      onPress={() => openAcceptModal(request)}
                      style={[styles.requestAcceptButton, { backgroundColor: theme.accent }]}>
                      <ThemedText type="caption" color="onAccent">
                        {t('friends.accept')}
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={() => handleDecline(request)} hitSlop={8}>
                      <Ionicons name="close" size={18} color={theme.muted} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </ThemedView>
          )}

          <ThemedView surface="surface" style={[styles.card, { borderColor: theme.line }]}>
            <ThemedText type="label" color="sub">
              {t('friends.addByEmail')}
            </ThemedText>
            <FormField
              value={addEmail}
              onChangeText={setAddEmail}
              placeholder={t('friends.emailPlaceholder')}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {groups.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {groups.map((g) => (
                  <Pressable
                    key={g.id}
                    onPress={() => setAddGroupId(g.id)}
                    style={[
                      styles.groupChip,
                      addGroupId === g.id
                        ? { backgroundColor: theme.accent }
                        : { backgroundColor: theme.card },
                    ]}>
                    <ThemedText type="caption" color={addGroupId === g.id ? 'onAccent' : 'sub'}>
                      {g.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <PrimaryButton
              label={t('friends.sendRequest')}
              onPress={handleSendRequest}
              loading={sending}
              disabled={!addEmail.trim() || !addGroupId}
            />
          </ThemedView>

          <ThemedView surface="surface" style={[styles.card, { borderColor: theme.line }]}>
            <ThemedText type="label" color="sub">
              {t('friends.createGroup')}
            </ThemedText>
            <View style={styles.newGroupRow}>
              <View style={styles.newGroupInput}>
                <FormField value={newGroupName} onChangeText={setNewGroupName} placeholder={t('friends.newGroupPlaceholder')} />
              </View>
              <Pressable
                onPress={handleCreateGroup}
                disabled={creatingGroup || !newGroupName.trim()}
                style={[styles.addGroupButton, { backgroundColor: theme.accent }]}>
                <Ionicons name="add" size={20} color={theme.onAccent} />
              </Pressable>
            </View>
          </ThemedView>

          {!loading && groups.length === 0 ? (
            <EmptyState icon="people-outline" title={t('friends.emptyGroupsTitle')} description={t('friends.emptyGroupsDescription')} />
          ) : (
            groups.map((group) => {
              const members = friends.filter((f) => f.groupId === group.id);
              return (
                <View key={group.id} style={styles.groupSection}>
                  <View style={styles.groupHeader}>
                    <ThemedText type="label">{group.name}</ThemedText>
                    <View style={styles.groupHeaderActions}>
                      <Pressable onPress={() => openRenameModal(group)} hitSlop={8}>
                        <Ionicons name="pencil-outline" size={16} color={theme.muted} />
                      </Pressable>
                      <Pressable onPress={() => handleDeleteGroup(group)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={16} color={theme.muted} />
                      </Pressable>
                    </View>
                  </View>
                  {members.length === 0 ? (
                    <ThemedText type="caption" color="muted">
                      {t('friends.emptyGroupMembers')}
                    </ThemedText>
                  ) : (
                    members.map((friend) => (
                      <View key={friend.friendUid} style={[styles.friendRow, { borderColor: theme.line }]}>
                        <Pressable style={styles.friendRowMain} onPress={() => goToFriendProfile(friend.friendUid)}>
                          <Avatar uri={friend.photoURL} size={38} />
                          <ThemedText type="body">{friend.nickname}</ThemedText>
                        </Pressable>
                        <View style={styles.friendRowActions}>
                          <Pressable onPress={() => goToFriendHistory(friend.friendUid)} hitSlop={8}>
                            <Ionicons name="book-outline" size={18} color={theme.muted} />
                          </Pressable>
                          <Pressable onPress={() => openMoveModal(friend)} hitSlop={8}>
                            <Ionicons name="swap-horizontal-outline" size={18} color={theme.muted} />
                          </Pressable>
                          <Pressable onPress={() => handleRemove(friend.friendUid)} hitSlop={8}>
                            <Ionicons name="close" size={18} color={theme.muted} />
                          </Pressable>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={!!acceptTarget} animationType="slide" transparent onRequestClose={() => setAcceptTarget(null)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAcceptTarget(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <ThemedText type="label">{t('friends.acceptGroupPrompt', { nickname: acceptTarget?.fromNickname ?? '' })}</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {groups.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => setAcceptGroupId(g.id)}
                  style={[
                    styles.groupChip,
                    acceptGroupId === g.id ? { backgroundColor: theme.accent } : { backgroundColor: theme.card },
                  ]}>
                  <ThemedText type="caption" color={acceptGroupId === g.id ? 'onAccent' : 'sub'}>
                    {g.name}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            <PrimaryButton label={t('friends.accept')} onPress={handleAccept} loading={accepting} disabled={!acceptGroupId} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!moveTarget} animationType="slide" transparent onRequestClose={() => setMoveTarget(null)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoveTarget(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <ThemedText type="label">{t('friends.moveGroupPrompt', { nickname: moveTarget?.nickname ?? '' })}</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {groups.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => setMoveGroupId(g.id)}
                  style={[
                    styles.groupChip,
                    moveGroupId === g.id ? { backgroundColor: theme.accent } : { backgroundColor: theme.card },
                  ]}>
                  <ThemedText type="caption" color={moveGroupId === g.id ? 'onAccent' : 'sub'}>
                    {g.name}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            <PrimaryButton
              label={t('friends.move')}
              onPress={handleMove}
              loading={moving}
              disabled={!moveGroupId || moveGroupId === moveTarget?.groupId}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={!!renameTarget} animationType="slide" transparent onRequestClose={() => setRenameTarget(null)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRenameTarget(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <ThemedText type="label">{t('friends.renameGroup')}</ThemedText>
            <FormField value={renameValue} onChangeText={setRenameValue} placeholder={t('friends.newGroupPlaceholder')} />
            <PrimaryButton
              label={t('dayDetail.save')}
              onPress={handleRename}
              loading={renaming}
              disabled={!renameValue.trim()}
            />
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
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  errorText: {
    flex: 1,
  },
  groupChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    marginRight: Spacing.two,
  },
  newGroupRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  newGroupInput: {
    flex: 1,
  },
  addGroupButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupSection: {
    gap: Spacing.two,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  groupHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  friendRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flex: 1,
  },
  friendRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  requestAcceptButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    borderRadius: Radius.pill,
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
