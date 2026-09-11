import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeSetting } from '@/context/theme-context';
import type { DamageLevel } from '@/types/letter';

/** 편지 전용 팔레트 — 앱 전체 테마 토큰(Colors)과 일부러 분리했다. 이
 * 화면 하나만을 위한 "누렇게 바랜 종이" 색이라, 전역 토큰에 섞으면 다른
 * 화면에서 실수로 재사용될 여지가 생긴다. cut은 종이가 찢겨 나간 자리에
 * "뒤에 비치는" 색 — 실제로는 이 컴포넌트를 감싼 화면의 배경색과 같아야
 * 자연스러운데, 그 배경이 항상 Colors[scheme].background라서 여기 직접
 * 박아뒀다(letters/[id].tsx가 이 값과 다른 배경 위에 얹힐 일은 없다).
 */
const PAPER = {
  light: { bg: '#F3E6C6', ink: '#4A3826', fold: '#E2CE9C', cut: '#FBF6EF' },
  dark: { bg: '#46392A', ink: '#F0E4C8', fold: '#59492F', cut: '#1C1814' },
};

const TOOTH_WIDTH = 11;
// 손상 없음: 손으로 뜬 종이 특유의 미세하게 우둘투둘한 가장자리 정도로만.
const DECKLE_HEIGHTS = [5, 3, 6, 4, 5, 3];
// half(반절 손실): 실제로 힘으로 찢어낸 것처럼 들쭉날쭉하고 큼직하게.
const RIP_HEIGHTS = [18, 6, 24, 10, 16, 4, 22, 8, 14, 5, 20, 7];

/** 종이 아래쪽 가장자리를 뾰족한 삼각형(borderTop 트릭)들의 행으로
 * 그린다 — 이 프로젝트는 react-native-svg가 없어서(픽셀 펫과 같은 이유)
 * 순수 View만으로 만들었다. heights 배열을 반복하면서 폭에 맞게 필요한
 * 만큼 그린다. */
function SawtoothEdge({ color, heights }: { color: string; heights: number[] }) {
  const [width, setWidth] = useState(0);
  const count = width > 0 ? Math.ceil(width / TOOTH_WIDTH) + 1 : 0;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={styles.sawRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: TOOTH_WIDTH / 2,
            borderRightWidth: TOOTH_WIDTH / 2,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopWidth: heights[i % heights.length],
            borderTopColor: color,
          }}
        />
      ))}
    </View>
  );
}

/** corner(귀퉁이 손실): 종이 위에 배경색 정사각형을 45도 돌려서 모서리에
 * 겹쳐두면, 부모의 overflow:hidden에 잘려나간 나머지가 "귀퉁이가
 * 찢겨나간" 삼각형 모양으로 보인다. */
function CornerBite({ cutColor }: { cutColor: string }) {
  return (
    <View
      style={[
        styles.cornerBite,
        { backgroundColor: cutColor },
      ]}
    />
  );
}

/** total(전손): 편지 한 장이 아니라 조각 3~4개로 흩어져 보이게 한다 —
 * 조각마다 모서리 반경을 제각각 다르게 줘서 손으로 찢은 조각처럼 보이게
 * 하고, 살짝씩 다른 각도로 기울여 흩어진 느낌을 낸다. 글자는 하나도
 * 넣지 않는다(완전히 못 읽는다는 컨셉).
 */
function ShreddedPaper({ bg, note }: { bg: string; note: string | null }) {
  return (
    <View style={styles.shredContainer}>
      <View style={styles.shredRow}>
        <View style={[styles.scrap, styles.scrapA, { backgroundColor: bg, transform: [{ rotate: '-9deg' }] }]} />
        <View style={[styles.scrap, styles.scrapB, { backgroundColor: bg, transform: [{ rotate: '14deg' }] }]} />
        <View style={[styles.scrap, styles.scrapC, { backgroundColor: bg, transform: [{ rotate: '-4deg' }] }]} />
      </View>
      {note && (
        <ThemedText type="caption" color="muted" style={styles.note}>
          {note}
        </ThemedText>
      )}
    </View>
  );
}

/**
 * 편지 한 통을 실제 종이처럼 그린다. text/note는 utils/letter-damage.ts의
 * maskLetterBody가 이미 등급에 맞춰 잘라둔 값을 그대로 받는다 — 이
 * 컴포넌트는 "얼마나 가릴지"는 모르고 "어떻게 보여줄지"만 담당한다(등급별
 * 마스킹 비율을 나중에 바꿔도 여기는 안 건드려도 됨).
 */
export function LetterPaper({
  damageLevel,
  text,
  note,
  style,
}: {
  damageLevel: DamageLevel;
  text: string;
  note: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { scheme } = useThemeSetting();
  const palette = PAPER[scheme];

  if (damageLevel === 'total') {
    return <ShreddedPaper bg={palette.bg} note={note} />;
  }

  return (
    <View style={style}>
      <View style={[styles.sheet, { backgroundColor: palette.bg }]}>
        <View style={[styles.fold, { backgroundColor: palette.fold }]} />
        <ThemedText style={[styles.body, { color: palette.ink }]}>{text}</ThemedText>
        {damageLevel === 'corner' && <CornerBite cutColor={palette.cut} />}
      </View>
      <SawtoothEdge color={palette.bg} heights={damageLevel === 'half' ? RIP_HEIGHTS : DECKLE_HEIGHTS} />
      {note && (
        <ThemedText type="caption" color="muted" style={styles.note}>
          {note}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    padding: Spacing.four,
    paddingTop: Spacing.five,
    borderTopLeftRadius: Radius.small,
    borderTopRightRadius: Radius.small,
    overflow: 'hidden',
    // 실제 종이처럼 살짝 그림자를 둬서 화면 배경 위에 "얹혀있는" 느낌을 낸다.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  fold: {
    position: 'absolute',
    top: 18,
    left: 0,
    right: 0,
    height: 1,
  },
  body: {
    fontFamily: 'NanumPenScript_400Regular',
    fontSize: 19,
    lineHeight: 28,
  },
  cornerBite: {
    position: 'absolute',
    top: -16,
    right: -16,
    width: 32,
    height: 32,
    transform: [{ rotate: '45deg' }],
  },
  sawRow: {
    flexDirection: 'row',
    width: '100%',
  },
  note: {
    marginTop: Spacing.two,
    fontStyle: 'italic',
  },
  shredContainer: {
    paddingVertical: Spacing.three,
  },
  shredRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  scrap: {
    width: 46,
    height: 34,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  scrapA: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  scrapB: {
    marginTop: 16,
    width: 34,
    height: 40,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 18,
  },
  scrapC: {
    marginTop: 4,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 13,
  },
});
