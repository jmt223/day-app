import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { FriendEntry, FriendGroup } from '@/types/user';

/**
 * 친구를 여러 명 골라야 하는 곳(연혁 작성 시 "함께한 사람", DAY 상세에서
 * 태그 수정)에서 공통으로 쓰는 검색 가능한 다중 선택 모달. 친구가 많아지면
 * (수백 명) 옆으로 넘기는 칩 목록은 하루종일 넘겨야 하는 문제가 있어서,
 * 세로 스크롤 목록 + 검색으로 대신한다.
 */
export function FriendPickerModal({
  visible,
  title,
  friends,
  groups,
  selectedUids,
  onToggle,
  onClose,
  onConfirm,
  confirmLoading,
}: {
  visible: boolean;
  title: string;
  friends: FriendEntry[];
  groups: FriendGroup[];
  selectedUids: string[];
  onToggle: (uid: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  confirmLoading?: boolean;
}) {
  const theme = useTheme();
  const { t, locale } = useLocale();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? friends.filter((f) => f.nickname.toLowerCase().includes(q)) : friends;
  }, [friends, search]);

  const grouped = useMemo(() => {
    const buckets = groups
      .map((group) => ({ group, members: filtered.filter((f) => f.groupId === group.id) }))
      .filter((entry) => entry.members.length > 0);
    // 친구 목록이 그룹 목록보다 먼저 도착했거나(둘이 따로 불러와지는 화면들이
    // 있어서), 친구의 groupId가 어떤 이유로든 지금 groups 목록에 없는
    // 경우를 대비한다 — 안 그러면 그 친구가 목록에서 그냥 조용히 사라져
    // "검색 결과가 없어요"로 잘못 보인다.
    const bucketedUids = new Set(buckets.flatMap((entry) => entry.members.map((m) => m.friendUid)));
    const ungrouped = filtered.filter((f) => !bucketedUids.has(f.friendUid));
    if (ungrouped.length > 0) {
      buckets.push({ group: { id: '__ungrouped__', name: t('friendPicker.ungrouped'), order: -1, createdAt: null }, members: ungrouped });
    }
    return buckets;
    // t 자체는 항상 같은 함수 참조라 locale을 명시적으로 넣어야 언어가
    // 바뀔 때 "그룹 없음" 라벨도 다시 계산된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, filtered, locale]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex}>
          <View style={styles.header}>
            <ThemedText type="title">{title}</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.sub} />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <FormField value={search} onChangeText={setSearch} placeholder={t('friendPicker.searchPlaceholder')} autoCapitalize="none" />
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {friends.length === 0 ? (
              <EmptyState icon="people-outline" title={t('friendPicker.emptyFriendsTitle')} description={t('friendPicker.emptyFriendsDescription')} />
            ) : filtered.length === 0 ? (
              <EmptyState icon="search-outline" title={t('friendPicker.emptySearchTitle')} />
            ) : (
              grouped.map(({ group, members }) => (
                <View key={group.id} style={styles.groupSection}>
                  <ThemedText type="caption" color="muted" style={styles.groupTitle}>
                    {group.name}
                  </ThemedText>
                  {members.map((friend) => {
                    const selected = selectedUids.includes(friend.friendUid);
                    return (
                      <Pressable
                        key={friend.friendUid}
                        style={[styles.row, { borderColor: theme.line }]}
                        onPress={() => onToggle(friend.friendUid)}>
                        <Avatar uri={friend.photoURL} size={32} />
                        <ThemedText type="body" style={styles.rowText}>
                          {friend.nickname}
                        </ThemedText>
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={selected ? theme.accent : theme.muted}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>

          <View style={[styles.footer, { borderColor: theme.line }]}>
            <PrimaryButton label={t('friendPicker.confirm', { count: selectedUids.length })} onPress={onConfirm} loading={confirmLoading} />
          </View>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  searchWrap: {
    padding: Spacing.four,
    paddingBottom: Spacing.two,
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  rowText: {
    flex: 1,
  },
  groupSection: {
    marginTop: Spacing.three,
  },
  groupTitle: {
    marginBottom: Spacing.one,
  },
  footer: {
    padding: Spacing.four,
    borderTopWidth: 1,
  },
});
