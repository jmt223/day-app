import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { moodIcon } from '@/constants/mood';
import { DEFAULT_FONT_PRESET, FONT_PRESETS } from '@/constants/theme';
import { useProtectedPhoto } from '@/hooks/use-protected-photo';
import { useTheme } from '@/hooks/use-theme';
import type { DayDoc } from '@/types/day';
import { previewTextFromBlocks } from '@/utils/content-blocks';

/**
 * DAY 목록의 썸네일. 사진이 있으면 첫 사진을, 사진 없이 글만 쓴 DAY면 "글 메모"
 * 모양(본문 앞부분이나 기분 아이콘)을 보여준다 — 예전엔 둘 다 똑같이 회색 사진
 * 아이콘이라, 글만 쓴 DAY가 사진이 깨진 것처럼 보였다. 사진이 있는 DAY에서만
 * 사진 아이콘(불러오는 중)이 보인다.
 *
 * variant: 'tall'은 홈 가로 카드처럼 큰 썸네일(본문 앞부분을 적어 보여줌),
 * 'small'은 목록 행의 작은 정사각형(기분 아이콘만).
 */
export function DayThumb({
  day,
  variant,
  style,
}: {
  day: Pick<DayDoc, 'photoURLs' | 'contentBlocks' | 'moodTag' | 'fontKey'>;
  variant: 'tall' | 'small';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const hasPhoto = day.photoURLs.length > 0;
  const cover = useProtectedPhoto(hasPhoto ? day.photoURLs[0] : undefined);

  if (hasPhoto) {
    return (
      <View style={[styles.box, { backgroundColor: theme.card }, style]}>
        {cover ? (
          <Image source={cover} style={styles.fill} contentFit="cover" />
        ) : (
          <Ionicons name="image-outline" size={variant === 'tall' ? 24 : 20} color={theme.muted} />
        )}
      </View>
    );
  }

  const icon = day.moodTag ? moodIcon(day.moodTag) : 'document-text-outline';
  if (variant === 'small') {
    return (
      <View style={[styles.box, { backgroundColor: theme.accentSoft }, style]}>
        <Ionicons name={icon} size={22} color={theme.accent} />
      </View>
    );
  }

  const preview = previewTextFromBlocks(day.contentBlocks);
  const fontFamily = (FONT_PRESETS[day.fontKey] ?? FONT_PRESETS[DEFAULT_FONT_PRESET]).sans;
  return (
    <View style={[styles.box, styles.note, { backgroundColor: theme.accentSoft }, style]}>
      {preview ? (
        <ThemedText type="caption" color="accentInk" numberOfLines={5} style={[styles.noteText, { fontFamily }]}>
          {preview}
        </ThemedText>
      ) : null}
      <Ionicons name={icon} size={16} color={theme.accent} style={styles.noteIcon} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  note: {
    alignItems: 'stretch',
    justifyContent: 'space-between',
    padding: 12,
  },
  noteText: {
    lineHeight: 19,
  },
  noteIcon: {
    alignSelf: 'flex-start',
  },
});
