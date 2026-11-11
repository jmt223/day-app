import type { ContentBlock } from '@/types/day';

/** 카드 미리보기용으로, 텍스트 블록만 이어붙인 한 줄 요약을 만든다. */
export function previewTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join(' ');
}
