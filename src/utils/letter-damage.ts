/**
 * 편지 손상 표시.
 *
 * 메시지를 "가로 3 × 세로 2 = 6칸"으로 나누되, 화면 픽셀이 아니라 글자 기준으로
 * 나눈다 — 0~2번 칸은 앞쪽 절반(윗줄 왼쪽→오른쪽), 3~5번 칸은 뒤쪽 절반이다.
 * 화면 폭에 따라 줄바꿈 위치가 달라져도 같은 칸엔 항상 같은 글자가 들어가서,
 * 다시 열거나 다른 기기로 봐도 정확히 같은 글자가 가려진다.
 *
 * 서버(functions/pet-logic.js의 textCells)와 글자 하나까지 똑같이 나눠야 한다 —
 * 서버는 "몇 번 칸이 손상됐는지"만 저장하고, 실제로 어느 글자를 가릴지는 여기서
 * 같은 규칙으로 다시 나눠서 정하기 때문이다.
 */

export const CELL_COUNT = 6;

export function textCells(text: string): string[] {
  const chars = Array.from(text || '');
  const n = chars.length;
  const cells: string[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const start = Math.floor((i * n) / CELL_COUNT);
    const end = Math.floor(((i + 1) * n) / CELL_COUNT);
    cells.push(chars.slice(start, end).join(''));
  }
  return cells;
}

/** 손상된 칸의 글자를 'ㅁ'으로 가린다. 공백과 줄바꿈은 그대로 둬서 문장
 * 모양(어디서 띄어 썼는지)은 남긴다. */
function maskCell(cell: string): string {
  return Array.from(cell)
    .map((ch) => (/\s/.test(ch) ? ch : 'ㅁ'))
    .join('');
}

export type DamageSegment = { text: string; damaged: boolean };

/** 화면에 그대로 이어 붙여 그릴 조각들. 연속된 같은 상태의 칸은 하나로 합친다. */
export function damageSegments(text: string, damagedCells: readonly number[] | null | undefined): DamageSegment[] {
  const damaged = new Set(damagedCells ?? []);
  const segments: DamageSegment[] = [];
  textCells(text).forEach((cell, index) => {
    if (!cell) return;
    const isDamaged = damaged.has(index);
    const piece = isDamaged ? maskCell(cell) : cell;
    const last = segments[segments.length - 1];
    if (last && last.damaged === isDamaged) {
      last.text += piece;
    } else {
      segments.push({ text: piece, damaged: isDamaged });
    }
  });
  return segments;
}

/** 목록 미리보기처럼 스타일 없이 한 줄로 보여줄 때. */
export function maskedText(text: string, damagedCells: readonly number[] | null | undefined): string {
  return damageSegments(text, damagedCells)
    .map((s) => s.text)
    .join('');
}

export function isDamaged(cells: readonly number[] | null | undefined): boolean {
  return Array.isArray(cells) && cells.length > 0;
}
