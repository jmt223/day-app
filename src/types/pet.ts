import type { Timestamp } from '@firebase/firestore';

/** 종마다 고유한 기본 손상 확률을 갖는다(constants/pets.ts의 PET_SPECIES 참고).
 * squirrel/turtle은 이번 범위에선 실제로 지급되지 않지만(결제 시스템이 아직
 * 없어 유료 뽑기를 구현할 수 없음), 나중에 뽑기가 생겼을 때 스키마 변경 없이
 * 바로 풀 수 있도록 타입에는 미리 넣어둔다. */
export type PetSpeciesKey = 'sparrow' | 'owl' | 'squirrel' | 'turtle';

/** 개체마다 무작위로 배정되는 성격 — 종의 기본 손상 확률에 보정치(±%p)를
 * 더한다(constants/pets.ts의 PET_PERSONALITIES). */
export type PetPersonalityKey = 'playful' | 'timid' | 'easygoing' | 'careful';

/** 이번 범위에서는 확률·기능에 아무 영향이 없는 순수 표시용 값이다 — 나중에
 * 번식·합성 같은 기능이 생길 때를 대비해 미리 저장만 해둔다. */
export type PetSex = 'male' | 'female';

export type PetStatus = 'idle' | 'away';

/** users/{uid}/pets/{petId}. "펫이 나가있으면(away) 그 펫으로는 새 편지를
 * 못 보낸다"는 게 이 기능 전체의 유일한 도배 방지 장치라, away -> idle
 * 전환은 클라이언트가 스스로 할 수 없고 Cloud Function(편지 답장 도착/자동
 * 만료 처리)만 할 수 있다 — firestore.rules의 pets 규칙 참고. */
export type PetDoc = {
  id: string;
  species: PetSpeciesKey;
  personality: PetPersonalityKey;
  sex: PetSex;
  name: string;
  status: PetStatus;
  /** away 상태일 때, 지금 물고 나간 편지. idle이면 null. */
  currentLetterId: string | null;
  createdAt: Timestamp | null;
};
