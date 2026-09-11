import type { Timestamp } from '@firebase/firestore';

import type { PetSpeciesKey } from '@/types/pet';

/** 편지가 이동 중 손상됐을 때의 등급. 서버(functions/index.js의
 * onLetterCreated/onLetterReplyCreated)만 계산해서 채운다 — 클라이언트가
 * 직접 쓸 수 있게 하면 나쁜 롤을 스스로 'none'으로 조작할 수 있다.
 * 정확히 얼마나 가릴지는 utils/letter-damage.ts의 maskLetterBody가
 * 등급만 보고 매번 계산해서, 나중에 마스킹 방식을 바꿔도 기존 데이터를
 * 마이그레이션할 필요가 없다. */
export type DamageLevel = 'none' | 'corner' | 'half' | 'total';

export type LetterStatus = 'awaiting_reply' | 'replied' | 'expired';

/** 최상위 letters/{letterId} (collectionGroup 아님 — firestore.rules 상단
 * 주석 참고: 서브컬렉션을 여러 부모에 걸쳐 collectionGroup으로 모아 읽는
 * 쿼리는 이 프로젝트에서 실제로 재현 테스트해본 결과 규칙을 어떤 형태로
 * 써도 permission-denied였다). 받은편지함/보낸편지함은 이 컬렉션을
 * toUid/fromUid로 각각 단일 쿼리해서 나눠 보여준다(src/data/letters.ts). */
export type LetterDoc = {
  id: string;
  fromUid: string;
  fromNickname: string;
  fromPhotoURL: string | null;
  /** 받는 사람 화면에 "OO의 참새가 답장을 기다리고 있어요"처럼 보여주기
   * 위한 비정규화 — 매번 펫 문서를 따로 조회하지 않아도 된다. */
  fromPetId: string;
  fromPetSpecies: PetSpeciesKey;
  fromPetName: string;
  toUid: string;
  toNickname: string;
  toPhotoURL: string | null;
  body: string;
  /** 보낸 사람이 고른 답장 대기 시간(시간 단위) — replyDeadline 계산에만
   * 쓰고, 실제 마감 시각은 서버가 createdAt 기준으로 계산해 replyDeadline에
   * 채운다(클라이언트 시계를 믿지 않기 위해). */
  waitHours: number;
  /** 서버가 채운다: createdAt + waitHours. */
  replyDeadline: Timestamp | null;
  /** 서버가 채운다(도착 시 손상 롤 결과). */
  outboundDamage: DamageLevel | null;
  status: LetterStatus;
  createdAt: Timestamp | null;
  repliedAt: Timestamp | null;
  expiredAt: Timestamp | null;
  /** 실제 문서 필드가 아니라, 보낸편지함 목록에서만 클라이언트가 답장
   * 서브문서를 따로 읽어와 붙이는 파생 값이다(listSentLettersPage 참고)
   * — 답장이 왔으면 목록 미리보기가 원래 보낸 내용 대신 "답장이 왔는지"를
   * 바로 보여주는 게 더 쓸모 있어서다. */
  replyPreview?: { body: string; damage: DamageLevel | null };
};

/** letters/{letterId}/reply/main — 문서 ID를 'main' 하나로 고정해서, 두
 * 번째 답장 시도는 자동으로 "이미 존재하는 문서를 create"가 되어 규칙에서
 * 그냥 거부된다(친구요청을 상대당 문서 1개로 두는 것과 같은 트릭). 이
 * 덕분에 이 프로젝트에 아직 없는 onDocumentUpdated 트리거를 새로 들여오지
 * 않고, 편지 생성·답장 도착 둘 다 onDocumentCreated 트리거로만 처리한다. */
export type LetterReplyDoc = {
  body: string;
  /** 서버가 채운다(반환 시 손상 롤 결과 — 발신 펫이 왕복 중 다시 손상될
   * 수 있다는 컨셉이라, 갈 때/올 때 각각 독립적으로 굴린다). */
  damage: DamageLevel | null;
  createdAt: Timestamp | null;
};

/** users/{toUid}/incomingSummons/{fromUid}. 문서 ID가 (from,to) 쌍마다
 * 하나로 고정되어 있어서, 재호출은 create가 아니라 update가 된다 — 그래서
 * "마지막 호출 후 24시간"이라는 쿨다운을 규칙에서
 * `resource.data.createdAt + duration.value(24,'h') <= request.time`로
 * 강제할 수 있다(firestore.rules 참고). 12시간이 지나 화면에서 안 보이게
 * 하는 건 별도 만료 처리 없이 클라이언트가 createdAt 기준으로 걸러서
 * 처리한다. */
export type SummonDoc = {
  fromUid: string;
  fromNickname: string;
  fromPhotoURL: string | null;
  createdAt: Timestamp | null;
};
