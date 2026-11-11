import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { speciesInfo } from '@/constants/pets';
import { FontFamily } from '@/constants/theme';
import type { AnyPetSpeciesKey } from '@/types/pet';
import { damageSegments } from '@/utils/letter-damage';

/**
 * 손상된 메시지 본문. 손상된 칸의 글자는 'ㅁ'으로 가리고, 그 위에 편지를 나른
 * 펫 종의 흔적(침 번짐, 발톱 자국, 그을림 …)을 스타일로 입힌다. 가리는 기준이
 * 픽셀이 아니라 글자라서(utils/letter-damage.ts) 화면 크기와 상관없이 항상 같은
 * 글자가 가려진다.
 */
export function DamagedText({
  text,
  cells,
  species,
  style,
}: {
  text: string;
  cells: readonly number[] | null | undefined;
  species: AnyPetSpeciesKey;
  style?: StyleProp<TextStyle>;
}) {
  const effect = speciesInfo(species).effect;
  const segments = damageSegments(text, cells);
  return (
    <Text style={style}>
      {segments.map((segment, index) =>
        segment.damaged ? (
          // 가린 부분은 앱 기본 글꼴로 그린다 — 손글씨체(나눔손글씨 펜)는 'ㅁ'
          // 자모를 "12"처럼 보이는 모양으로 그려서 가린 표시가 숫자처럼 읽혔다.
          <Text key={index} style={[effect.span, styles.masked]}>
            {segment.text}
          </Text>
        ) : (
          <Text key={index}>{segment.text}</Text>
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  masked: {
    fontFamily: FontFamily.sans,
    fontSize: 16,
    letterSpacing: 1,
  },
});
