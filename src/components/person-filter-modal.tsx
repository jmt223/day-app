import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { FriendEntry, FriendGroup } from '@/types/user';

export function PersonFilterModal({
  visible,
  friends,
  groups,
  selectedUid,
  onSelect,
  onClose,
}: {
  visible: boolean;
  friends: FriendEntry[];
  groups: FriendGroup[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  onClose: () => void;
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
    // 친구 목록이 그룹 목록보다 먼저 도착했거나 groupId가 지금 groups
    // 목록에 없는 경우, 그 친구가 조용히 사라지지 않고 여기 모인다.
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

  function handleSelect(uid: string | null) {
    onSelect(uid);
    setSearch('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex}>
          <View style={styles.header}>
            <ThemedText type="title">{t('personFilter.title')}</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.sub} />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <FormField value={search} onChangeText={setSearch} placeholder={t('friendPicker.searchPlaceholder')} autoCapitalize="none" />
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            <Pressable style={[styles.row, { borderColor: theme.line }]} onPress={() => handleSelect(null)}>
              <View style={[styles.allIcon, { backgroundColor: theme.card }]}>
                <Ionicons name="people-outline" size={16} color={theme.sub} />
              </View>
              <ThemedText type="body" style={styles.rowText}>
                {t('personFilter.all')}
              </ThemedText>
              {selectedUid === null && <Ionicons name="checkmark" size={18} color={theme.accent} />}
            </Pressable>

            {filtered.length === 0 ? (
              <EmptyState icon="search-outline" title={t('friendPicker.emptySearchTitle')} />
            ) : (
              grouped.map(({ group, members }) => (
                <View key={group.id} style={styles.groupSection}>
                  <ThemedText type="caption" color="muted" style={styles.groupTitle}>
                    {group.name}
                  </ThemedText>
                  {members.map((friend) => (
                    <Pressable
                      key={friend.friendUid}
                      style={[styles.row, { borderColor: theme.line }]}
                      onPress={() => handleSelect(friend.friendUid)}>
                      <Avatar uri={friend.photoURL} size={32} />
                      <ThemedText type="body" style={styles.rowText}>
                        {friend.nickname}
                      </ThemedText>
                      {selectedUid === friend.friendUid && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
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
  allIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupSection: {
    marginTop: Spacing.three,
  },
  groupTitle: {
    marginBottom: Spacing.one,
  },
});
