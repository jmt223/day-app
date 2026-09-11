import { View } from 'react-native';

import type { PetSpeciesKey } from '@/types/pet';

/** 각 셀이 12x12 격자 안의 한 칸이다. React Native엔 캔버스가 기본으로
 * 없고, 이 프로젝트는 react-native-svg 같은 그리기 라이브러리도 안 쓰고
 * 있어서(package.json 확인함) 새 네이티브 의존성을 안 늘리려고 그냥 View
 * 격자로 도트를 찍는다 — 격자가 12x12(144칸)로 작아서 성능에 문제될
 * 정도가 아니고, 웹/iOS/안드로이드에서 완전히 동일하게 보인다. */
const GRID_SIZE = 12;

type Cell = string | null;
type Grid = Cell[][];

function emptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () => Array<Cell>(GRID_SIZE).fill(null));
}

/** 둥근 몸통 실루엣 — 행마다 채울 너비를 지정해서 가운데 정렬로 채운다.
 * 종별 차이는 이 위에 눈·귀·부리·꼬리 같은 포인트만 겹쳐서 만든다(전부
 * 손으로 좌표를 찍은 도트 그림이라, 픽셀 완벽한 정확도보다는 "귀여운
 * 덩어리 + 종을 알아볼 수 있는 특징 하나"를 목표로 했다). */
const BODY_ROW_WIDTHS = [4, 6, 8, 10, 10, 10, 10, 10, 8, 6, 0, 0];

function paintBody(grid: Grid, bodyColor: string, outlineColor: string) {
  BODY_ROW_WIDTHS.forEach((width, row) => {
    if (width === 0) return;
    const start = (GRID_SIZE - width) / 2;
    for (let col = start; col < start + width; col++) {
      const isEdge = col === start || col === start + width - 1;
      grid[row][col] = isEdge ? outlineColor : bodyColor;
    }
  });
  // 발
  grid[10][4] = outlineColor;
  grid[10][5] = outlineColor;
  grid[10][7] = outlineColor;
  grid[10][8] = outlineColor;
}

function paint(grid: Grid, points: [number, number, string][]) {
  points.forEach(([row, col, color]) => {
    if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) grid[row][col] = color;
  });
}

const BLACK = '#2A2118';

function buildGrid(species: PetSpeciesKey): Grid {
  const grid = emptyGrid();

  switch (species) {
    case 'sparrow': {
      paintBody(grid, '#C98A4B', '#8A5A2B');
      // 눈 + 옆으로 튀어나온 삼각형 부리(뒤쪽 outline 한 칸까지 주황으로
      // 덮어서 부리가 얼굴에 자연스럽게 붙어 보이게 한다)
      paint(grid, [
        [4, 4, BLACK],
        [4, 7, BLACK],
        [5, 11, '#E8871E'],
        [6, 10, '#E8871E'],
        [6, 11, '#E8871E'],
        // 배쪽 크림색
        [7, 4, '#F3DFC0'],
        [7, 5, '#F3DFC0'],
        [7, 6, '#F3DFC0'],
        [7, 7, '#F3DFC0'],
      ]);
      return grid;
    }
    case 'owl': {
      paintBody(grid, '#8B6A4F', '#5B4433');
      // 크고 동그란 눈(부엉이 특징) + 머리 위 깃털 뿔(2칸씩 이어서 몸통과
      // 확실히 구분되게 한다)
      paint(grid, [
        [0, 3, '#5B4433'],
        [1, 2, '#5B4433'],
        [0, 8, '#5B4433'],
        [1, 9, '#5B4433'],
        [4, 3, '#F4E7C9'],
        [4, 4, '#F4E7C9'],
        [4, 7, '#F4E7C9'],
        [4, 8, '#F4E7C9'],
        [5, 3, '#F4E7C9'],
        [5, 4, '#F4E7C9'],
        [5, 7, '#F4E7C9'],
        [5, 8, '#F4E7C9'],
        [4, 4, BLACK],
        [5, 4, BLACK],
        [4, 7, BLACK],
        [5, 7, BLACK],
        [7, 5, '#E8871E'],
        [7, 6, '#E8871E'],
      ]);
      return grid;
    }
    case 'squirrel': {
      paintBody(grid, '#B06A3A', '#7A431F');
      // 동그란 귀(테두리색이라 몸통과 확실히 구분) + 머리 위에서부터
      // 등을 타고 넘어오는 굵은 주황색 꼬리(몸통 갈색과 확실히 다른
      // 색이라야 아이콘 크기에서도 꼬리라고 알아볼 수 있다 — 처음엔
      // 꼬리를 몸통과 비슷한 갈색으로 뒀다가 작게 렌더링해보니 거의
      // 안 보여서 대비되는 주황으로 바꿨다).
      paint(grid, [
        [0, 3, '#7A431F'],
        [0, 8, '#7A431F'],
        [4, 4, BLACK],
        [4, 7, BLACK],
        [7, 4, '#F3DFC0'],
        [7, 5, '#F3DFC0'],
        [7, 6, '#F3DFC0'],
        [7, 7, '#F3DFC0'],
        [0, 9, '#E07B39'],
        [1, 10, '#E07B39'],
        [2, 11, '#E07B39'],
        [3, 11, '#E07B39'],
        [4, 11, '#E07B39'],
        [5, 11, '#E07B39'],
        [6, 11, '#E07B39'],
        [7, 11, '#E07B39'],
      ]);
      return grid;
    }
    case 'turtle': {
      paintBody(grid, '#6FAE6E', '#3E7A45');
      // 등껍질 무늬(점) + 작게 내민 머리
      paint(grid, [
        [4, 4, BLACK],
        [4, 7, BLACK],
        [4, 5, '#3E7A45'],
        [4, 6, '#DDECD0'],
        [6, 4, '#3E7A45'],
        [6, 7, '#3E7A45'],
        [7, 3, '#3E7A45'],
        [7, 8, '#3E7A45'],
        [10, 5, '#8FCB86'],
        [10, 6, '#8FCB86'],
        [11, 5, '#8FCB86'],
        [11, 6, '#8FCB86'],
      ]);
      return grid;
    }
    default:
      paintBody(grid, '#B0B0B0', '#707070');
      return grid;
  }
}

export function PixelPet({ species, size = 56 }: { species: PetSpeciesKey; size?: number }) {
  const grid = buildGrid(species);
  const cell = size / GRID_SIZE;

  return (
    <View style={{ width: size, height: size }}>
      {grid.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((color, c) => (
            <View
              key={c}
              style={{
                width: cell,
                height: cell,
                backgroundColor: color ?? 'transparent',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
