import type { Timestamp } from '@firebase/firestore';

import type { AnyPetSpeciesKey } from '@/types/pet';

/** 'cells'면 손상된 칸 번호가 같이 저장돼 있다(outboundDamageCells /
 * reply.damageCells). 손상 추첨은 서버만 한다 — 클라이언트가 쓰게 하면 나쁜
 * 결과를 스스로 지울 수 있다. 'corner'/'half'/'total'은 개편 전 형식이다. */
export type DamageLevel = 'none' | 'cells' | 'corner' | 'half' | 'total';

/**
 * awaiting_reply: 펫이 상대 곁에서 답장을 기다리는 중
 * replied: 답장을 물고 돌아옴
 * expired: 답장 없이 돌아옴(returnReason: 시간 종료 / 서두르는 성격의 조기 복귀)
 * recalled: 주인이 "일로 와"로 불러들임
 */
export type LetterStatus = 'awaiting_reply' | 'replied' | 'expired' | 'recalled';

/** letter: 보통 편지. summon_response: "펫 보내줘" 호출에 응답해서 메시지 없이
 * 펫만 보낸 것 — 호출한 사람이 그 펫에 답장을 실어 보낸다. */
export type LetterKind = 'letter' | 'summon_response';

/** 성격 예외 행동(서버가 편지 도착 때 정한다). */
export type LetterBehavior = 'normal' | 'early_return' | 'overstay';

/** 답장 사본 — 서버가 답장을 처리할 때 부모 편지에도 복사해둔다. 덕분에 대화창은
 * 편지 목록만 구독해도 답장까지 같이 보인다. */
export type LetterReplyCopy = {
  body: string;
  damage: DamageLevel | null;
  damageCells?: number[];
  createdAt: Timestamp | null;
};

/** 최상위 letters/{letterId}. 두 사람 사이 대화창은 이 컬렉션을
 * (fromUid, toUid) 양방향으로 각각 쿼리해서 합쳐 보여준다(src/data/letters.ts). */
export type LetterDoc = {
  id: string;
  kind?: LetterKind;
  fromUid: string;
  fromNickname: string;
  fromPhotoURL: string | null;
  fromPetId: string;
  fromPetSpecies: AnyPetSpeciesKey;
  fromPetName: string;
  toUid: string;
  toNickname: string;
  toPhotoURL: string | null;
  body: string;
  /** 보낸 사람이 고른 답장 대기시간(분). 예전 편지는 waitHours(시간). */
  waitMinutes?: number;
  waitHours?: number;
  /** 서버가 채운다: 도착 시각 + 대기시간. */
  replyDeadline: Timestamp | null;
  /** 서버가 채운다: 실제로 자동 복귀하는 시각. 서두르는 성격이면 더 이르고,
   * 계속 머무는 중이면 null. 필드가 아예 없으면 아직 서버 처리 전이다. */
  autoReturnAt?: Timestamp | null;
  behavior?: LetterBehavior;
  outboundDamage: DamageLevel | null;
  outboundDamageCells?: number[];
  status: LetterStatus;
  returnReason?: 'timeout' | 'early';
  createdAt: Timestamp | null;
  repliedAt: Timestamp | null;
  expiredAt: Timestamp | null;
  recalledAt?: Timestamp | null;
  reply?: LetterReplyCopy;
  /** "뭐라고 했어?"를 이미 물어봤는지(메시지당 한 번). */
  outboundReaskedAt?: Timestamp | null;
  replyReaskedAt?: Timestamp | null;
  /** 상대방이 이번 방문에 이 펫을 쓰다듬었는지 / 간식을 줬는지. */
  visitor?: { petted?: boolean; snacked?: boolean };
};

/** letters/{letterId}/reply/main — 문서 ID를 'main' 하나로 고정해서, 두
 * 번째 답장 시도는 자동으로 "이미 존재하는 문서를 create"가 되어 규칙에서
 * 거부된다. damage/damageCells는 서버가 채운다. */
export type LetterReplyDoc = {
  body: string;
  damage: DamageLevel | null;
  damageCells?: number[];
  createdAt: Timestamp | null;
};

/** users/{toUid}/incomingSummons/{fromUid}. 문서 ID가 (from,to) 쌍마다
 * 하나로 고정되어 있어서, 재호출은 create가 아니라 update가 된다 — 그래서
 * "마지막 호출 후 24시간" 쿨다운을 규칙에서 강제할 수 있다. 호출받은 사람이
 * 펫을 보내면 서버가 handledAt을 채운다. 12시간이 지나면 화면에서 안 보인다. */
export type SummonDoc = {
  fromUid: string;
  fromNickname: string;
  fromPhotoURL: string | null;
  createdAt: Timestamp | null;
  handledAt?: Timestamp | null;
};
