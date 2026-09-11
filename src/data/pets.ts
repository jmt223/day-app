import { collection, doc, getDocs, increment, serverTimestamp, updateDoc, writeBatch } from '@firebase/firestore';

import { db } from '@/lib/firebase';
import { petSpeciesLabel, randomPersonality, randomSex, SECOND_PET_MISSION_DAY_COUNT } from '@/constants/pets';
import type { PetDoc } from '@/types/pet';
import type { UserProfile } from '@/types/user';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

export async function listMyPets(uid: string): Promise<PetDoc[]> {
  const database = requireDb();
  const snap = await getDocs(collection(database, 'users', uid, 'pets'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PetDoc, 'id'>) }));
}

/** users/{uid} 문서와 새 펫 문서를 한 배치로 같이 쓴다(petCount 규칙이
 * dayCount와 같은 "±1 증감만" 패턴이라, 둘 중 하나만 성공하면 안 된다). */
async function grantPet(uid: string, species: 'sparrow' | 'owl'): Promise<void> {
  const database = requireDb();
  const petRef = doc(collection(database, 'users', uid, 'pets'));
  const batch = writeBatch(database);
  batch.set(petRef, {
    species,
    personality: randomPersonality(),
    sex: randomSex(),
    name: petSpeciesLabel(species),
    status: 'idle',
    currentLetterId: null,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(database, 'users', uid), { petCount: increment(1) });
  await batch.commit();
}

/** 가입 시 기본 지급되는 첫 펫(참새) — ensureUserProfile의 신규 가입
 * 분기, 그리고 이 기능 이전에 이미 가입한 계정을 위해 pets.tsx 진입 시
 * petCount가 아직 없을 때 지연 호출된다(다른 사람 계정을 내가 직접 손대는
 * 게 아니라 본인이 화면을 열 때 자기 계정에 스스로 쓰는 것이라 안전하다). */
export async function grantStarterPet(uid: string): Promise<void> {
  await grantPet(uid, 'sparrow');
}

/** pets.tsx뿐 아니라 편지함 탭/편지 쓰기 화면 등 "펫이 있어야 의미 있는"
 * 다른 화면에서도 이걸 먼저 불러서, petCount가 아예 없는 계정(이 기능
 * 이전 가입자가 "내 펫" 화면을 아직 한 번도 안 열어본 경우)이 펫을 하나도
 * 못 받은 채로 "펫이 모두 배달 중이에요" 같은 엉뚱한 안내를 보는 일이
 * 없게 한다. 반환값이 true면 방금 지급됐다는 뜻이라, 호출한 쪽에서
 * refreshProfile 후 목록을 다시 읽어야 한다. */
export async function ensureStarterPet(uid: string, profile: Pick<UserProfile, 'petCount'>): Promise<boolean> {
  if (profile.petCount) return false;
  await grantStarterPet(uid);
  return true;
}

/** 두 번째 펫(부엉이) — "앱을 많이 쓰는지"를 가늠할 별도 트래킹이 없어서
 * 이미 있는 dayCount를 기준으로 삼는다(임의 기본값, 나중에 조정 가능). */
export function canClaimMissionPet(profile: Pick<UserProfile, 'petCount' | 'dayCount'>): boolean {
  return (profile.petCount ?? 0) === 1 && profile.dayCount >= SECOND_PET_MISSION_DAY_COUNT;
}

export async function grantMissionPet(uid: string): Promise<void> {
  await grantPet(uid, 'owl');
}

export async function renamePet(uid: string, petId: string, name: string): Promise<void> {
  const database = requireDb();
  const trimmed = name.trim();
  if (!trimmed) return;
  await updateDoc(doc(database, 'users', uid, 'pets', petId), { name: trimmed.slice(0, 20) });
}
