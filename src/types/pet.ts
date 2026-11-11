import type { Timestamp } from '@firebase/firestore';

/** 기획서의 14종(일반 새와 닭은 별도 종). 종마다 손상 확률은 같고, 손상
 * "표현"만 다르다(constants/pets.ts의 PET_SPECIES). */
export type PetSpeciesKey =
  | 'dog'
  | 'cat'
  | 'bird'
  | 'horse'
  | 'cow'
  | 'pig'
  | 'rat'
  | 'tiger'
  | 'rabbit'
  | 'dragon'
  | 'snake'
  | 'sheep'
  | 'monkey'
  | 'chicken';

/** 이 기능 개편 전에 지급된 펫의 종. 새로 만들지는 않고, 이미 있는 펫을 계속
 * 보여주기 위해서만 남겨둔다(참새·부엉이는 "새"처럼 취급). */
export type LegacyPetSpeciesKey = 'sparrow' | 'owl' | 'squirrel' | 'turtle';

export type AnyPetSpeciesKey = PetSpeciesKey | LegacyPetSpeciesKey;

/** 서두르는 / 여유로운 / 꼼꼼한 / 장난꾸러기 / 수줍은 / 듬직한.
 * 예전 키(easygoing, careful, playful, timid)는 그대로 살려서 기존 펫이 자연스럽게
 * 새 이름으로 보이게 했다. */
export type PetPersonalityKey = 'hasty' | 'easygoing' | 'careful' | 'playful' | 'timid' | 'reliable';

/** 순수 표시용 — 확률이나 기능에는 영향이 없다. */
export type PetSex = 'male' | 'female';

export type PetStatus = 'idle' | 'away';

/** 배달 기록. 전부 서버(functions/letters-core.js)만 올린다. */
export type PetStats = {
  deliveries?: number;
  damaged?: number;
  earlyReturns?: number;
  overstays?: number;
  recalls?: number;
  ownerPets?: number;
  ownerSnacks?: number;
  pettedByOthers?: number;
  snacksFromOthers?: number;
};

/** 친밀도 "하루 최대"를 세는 그날의 기록(KST 날짜 기준). */
export type PetDaily = {
  day: string;
  deliveryGains: number;
  petted: boolean;
  snacked: boolean;
  total: number;
};

/** users/{uid}/pets/{petId}. away -> idle 전환, 친밀도, 배달 기록은 Cloud
 * Function만 바꿀 수 있다(firestore.rules의 pets 규칙 참고). */
export type PetDoc = {
  id: string;
  species: AnyPetSpeciesKey;
  personality: PetPersonalityKey;
  sex: PetSex;
  name: string;
  status: PetStatus;
  /** away 상태일 때, 지금 물고 나간(또는 상대 곁에서 기다리는) 편지. */
  currentLetterId: string | null;
  /** 주인과의 친밀도 0~100. 없으면 0. */
  intimacy?: number;
  daily?: PetDaily;
  stats?: PetStats;
  createdAt: Timestamp | null;
};
