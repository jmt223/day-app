import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { moodIcon } from '@/constants/mood';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { DayDoc } from '@/types/day';
import { relativeTimeFromNow } from '@/utils/date';

/**
 * 게시판형 DAY 한 줄 — "제목 [댓글수]". 사진이 있는 글은 앞에 사진 아이콘,
 * 없으면 그날의 기분 아이콘을 붙여서 목록만 훑어봐도 어떤 글인지 감이 오게 했다.
 * 댓글이 없으면 [0]은 생략한다(게시판 관례).
 */
export function DayListRow({ day, onPress, isLast }: { day: DayDoc; onPress: () => void; isLast?: boolean }) {
  const theme = useTheme();
  const { t } = useLocale();
  const hasPhoto = day.photoURLs.length > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line },
        pressed && { backgroundColor: theme.card },
      ]}
      accessibilityRole="button">
      <Ionicons
        name={hasPhoto ? 'image' : day.moodTag ? moodIcon(day.moodTag) : 'document-text-outline'}
        size={16}
        color={hasPhoto ? theme.accent : theme.muted}
        style={styles.icon}
      />
      <View style={styles.main}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, { color: theme.ink }]} numberOfLines={1}>
            {day.title}
            {day.commentCount > 0 && <Text style={[styles.count, { color: theme.accent }]}> [{day.commentCount}]</Text>}
          </Text>
          <ThemedText type="caption" color="muted" style={styles.time}>
            {relativeTimeFromNow(day.createdAt)}
          </ThemedText>
        </View>
        <ThemedText type="caption" color="sub" numberOfLines={1}>
          {day.authorNickname}
          {day.likeCount > 0 ? `  ·  ♡ ${day.likeCount}` : ''}
          {day.taggedFriendNicknames.length > 0 ? `  ·  ${t('main.withFriends', { count: day.taggedFriendNicknames.length })}` : ''}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.three,
  },
  icon: {
    width: 18,
    textAlign: 'center',
  },
  main: {
    flex: 1,
    gap: 2,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
    fontFamily: 'GowunDodum_400Regular',
    fontSize: 14.5,
    lineHeight: 20,
  },
  count: {
    fontWeight: '700',
    fontSize: 13,
  },
  time: {
    flexShrink: 0,
  },
});
