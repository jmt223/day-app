import type { LetterDoc } from '@/types/letter';

/** 답장 마감(도착 + 대기시간). 서버가 채우기 전 몇 초 동안은 같은 계산식으로
 * 추정한다 — 막 보낸 직후에도 남은 시간이 바로 보이게. */
export function replyDeadlineMs(letter: LetterDoc): number | null {
  if (letter.replyDeadline) return letter.replyDeadline.toMillis();
  if (!letter.createdAt) return null;
  const minutes = letter.waitMinutes ?? (letter.waitHours ?? 24) * 60;
  return letter.createdAt.toMillis() + minutes * 60 * 1000;
}

/**
 * 펫이 아직 상대 곁에서 기다리는 중인지(=답장을 실을 수 있는지). firestore.rules의
 * letterAcceptsReply와 같은 판단이다. 서두르는 펫은 마감보다 먼저 떠날 수 있고
 * (autoReturnAt), 여유로운 펫은 마감이 지나도 머문다(autoReturnAt == null).
 * 서버가 아직 처리 전이면(autoReturnAt 필드 자체가 없음) 답장은 잠깐 막는다.
 */
export function petIsWaiting(letter: LetterDoc, nowMs: number): boolean {
  if (letter.status !== 'awaiting_reply') return false;
  if (letter.autoReturnAt === undefined) {
    const deadline = replyDeadlineMs(letter);
    return deadline === null || nowMs <= deadline;
  }
  return letter.autoReturnAt === null || nowMs <= letter.autoReturnAt.toMillis();
}

/** 서버가 도착 처리를 끝내서 답장을 받을 준비가 됐는지. */
export function letterReadyForReply(letter: LetterDoc): boolean {
  return letter.autoReturnAt !== undefined || (letter.replyDeadline !== null && letter.replyDeadline !== undefined);
}

/** 마감이 지났는데도 계속 머무는 중인지(여유로운 성격). */
export function petIsOverstaying(letter: LetterDoc, nowMs: number): boolean {
  const deadline = replyDeadlineMs(letter);
  return letter.status === 'awaiting_reply' && letter.autoReturnAt === null && deadline !== null && nowMs > deadline;
}

/** "24:18" / "1:05:09" 같은 남은 시간. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 편지와 그 답장이 대화창 시간순에서 차지하는 위치. 답장은 답장 시각에 놓인다. */
export function letterSortMs(letter: LetterDoc): number {
  return letter.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
}

export function lastActivityMs(letter: LetterDoc): number {
  const sent = letter.createdAt?.toMillis() ?? 0;
  const replied = letter.reply?.createdAt?.toMillis() ?? letter.repliedAt?.toMillis() ?? 0;
  return Math.max(sent, replied);
}
