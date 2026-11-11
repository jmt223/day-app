import { StyleSheet, Text, View } from 'react-native';

import { speciesInfo } from '@/constants/pets';
import { Colors } from '@/constants/theme';
import { useThemeSetting } from '@/context/theme-context';
import type { AnyPetSpeciesKey } from '@/types/pet';

/**
 * 펫 얼굴. 목업처럼 손그림 일러스트를 쓰려면 14종 각각의 그림 에셋이 필요한데
 * 아직 없어서, 어느 기기에서나 바로 알아볼 수 있는 이모지를 종마다 다른 파스텔
 * 배경 위에 얹어서 쓴다(그림이 생기면 이 컴포넌트만 바꾸면 된다).
 */
export function PetAvatar({
  species,
  size = 56,
  badge,
}: {
  species: AnyPetSpeciesKey;
  size?: number;
  /** 오른쪽 아래 작은 표시(예: 편지를 물고 나간 중이면 ✉️). */
  badge?: string;
}) {
  const { scheme } = useThemeSetting();
  const info = speciesInfo(species);
  // 다크 모드에선 파스텔 배경이 너무 튀어서 같은 색을 옅게 깐다.
  const backgroundColor = scheme === 'dark' ? `${info.tint}30` : info.tint;
  const fontSize = Math.round(size * 0.56);

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.32, backgroundColor }]}>
      <Text style={{ fontSize, lineHeight: Math.round(fontSize * 1.25) }} allowFontScaling={false}>
        {info.emoji}
      </Text>
      {badge && (
        <View
          style={[
            styles.badge,
            {
              width: size * 0.4,
              height: size * 0.4,
              borderRadius: size * 0.2,
              right: -size * 0.06,
              bottom: -size * 0.06,
              backgroundColor: Colors[scheme].surface,
            },
          ]}>
          <Text style={{ fontSize: Math.round(size * 0.22) }} allowFontScaling={false}>
            {badge}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});
