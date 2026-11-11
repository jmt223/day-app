import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from '@firebase/firestore';

import { DEFAULT_PET_RULES, MAX_PETS, randomPersonality, randomSex, SECOND_PET_MISSION_DAY_COUNT, type PetRules } from '@/constants/pets';
import { auth, db } from '@/lib/firebase';
import { functionUrl } from '@/lib/functions-url';
import type { PetDoc, PetSpeciesKey } from '@/types/pet';
import type { UserProfile } from '@/types/user';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

function toPet(id: string, data: Record<string, unknown>): PetDoc {
  return { id, ...(data as Omit<PetDoc, 'id'>) };
}

function sortPets(pets: PetDoc[]): PetDoc[] {
  return pets.sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
}

export async function listMyPets(uid: string): Promise<PetDoc[]> {
  const database = requireDb();
  const snap = await getDocs(collection(database, 'users', uid, 'pets'));
  return sortPets(snap.docs.map((d) => toPet(d.id, d.data())));
}

/** 내 펫 목록을 실시간으로 받는다 — 답장이 와서 펫이 돌아오거나(서버가
 * idle로 바꿈) 친밀도가 오르면 화면이 바로 바뀐다. */
export function subscribeMyPets(uid: string, onChange: (pets: PetDoc[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const database = requireDb();
  return onSnapshot(
    collection(database, 'users', uid, 'pets'),
    (snap) => onChange(sortPets(snap.docs.map((d) => toPet(d.id, d.data())))),
    (error) => onError?.(error)
  );
}

/**
 * 펫을 데려온다(종은 사용자가 고르고, 성격은 아직 기획 미정이라 무작위).
 * 펫 문서와 petCount +1을 반드시 한 배치로 쓴다 — 보안 규칙이 이 짝을
 * getAfter로 확인해서, 펫 문서만 따로 계속 만드는 걸 막는다.
 */
export async function adoptPet(uid: string, species: PetSpeciesKey, name: string): Promise<string> {
  const database = requireDb();
  const petRef = doc(collection(database, 'users', uid, 'pets'));
  const batch = writeBatch(database);
  batch.set(petRef, {
    species,
    personality: randomPersonality(),
    sex: randomSex(),
    name: name.trim().slice(0, 20),
    status: 'idle',
    currentLetterId: null,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(database, 'users', uid), { petCount: increment(1) });
  await batch.commit();
  return petRef.id;
}

/** 두 번째 펫(미션 보상) — DAY를 7개 쓰면 받는다. 종은 이때도 직접 고른다.
 * 지금은 최대 MAX_PETS(2)마리라 "한 마리 있을 때"만 해당한다. */
export function canClaimMissionPet(profile: Pick<UserProfile, 'petCount' | 'dayCount'>): boolean {
  const count = profile.petCount ?? 0;
  return count >= 1 && count < MAX_PETS && profile.dayCount >= SECOND_PET_MISSION_DAY_COUNT;
}

export async function renamePet(uid: string, petId: string, name: string): Promise<void> {
  const database = requireDb();
  const trimmed = name.trim();
  if (!trimmed) return;
  await updateDoc(doc(database, 'users', uid, 'pets', petId), { name: trimmed.slice(0, 20) });
}

let cachedRules: { rules: PetRules; at: number } | null = null;

/** 운영 중 Firebase 콘솔에서 바꾼 확률값(config/petRules)을 기본값 위에
 * 덮어쓴다. 화면에 "손상 확률 N%"를 보여줄 때만 쓰고, 실제 추첨은 서버가 한다. */
export async function getPetRules(): Promise<PetRules> {
  if (cachedRules && Date.now() - cachedRules.at < 5 * 60 * 1000) return cachedRules.rules;
  let rules = DEFAULT_PET_RULES;
  try {
    const snap = await getDoc(doc(requireDb(), 'config', 'petRules'));
    const data = snap.exists() ? (snap.data() as Partial<PetRules>) : null;
    if (data) {
      rules = {
        ...DEFAULT_PET_RULES,
        ...(typeof data.intimacyDamageReductionPerPoint === 'number'
          ? { intimacyDamageReductionPerPoint: data.intimacyDamageReductionPerPoint }
          : {}),
        ...(typeof data.minDamagePercent === 'number' ? { minDamagePercent: data.minDamagePercent } : {}),
        personalities: { ...DEFAULT_PET_RULES.personalities, ...(data.personalities ?? {}) },
      };
    }
  } catch {
    // 못 읽으면 기본값으로 보여준다(표시용이라 치명적이지 않다).
  }
  cachedRules = { rules, at: Date.now() };
  return rules;
}

/** petAction Cloud Function이 돌려주는 에러 코드(functions/letters-core.js). */
export class PetActionError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function callPetAction<T>(body: Record<string, unknown>): Promise<T> {
  const user = auth?.currentUser;
  if (!user) throw new PetActionError('unauthorized');
  const token = await user.getIdToken();
  const res = await fetch(functionUrl('petAction'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new PetActionError(data.error ?? `http-${res.status}`);
  return data as T;
}

/** "일로 와" — 기다리는 중인 펫을 바로 불러들인다. */
export function recallPet(petId: string): Promise<{ ok: true }> {
  return callPetAction({ action: 'recall', petId });
}

export type InteractResult = { ok: true; by: 'owner' | 'visitor'; gained: number; intimacy: number };

/** 쓰다듬기 / 간식 주기. 주인이면 친밀도가 오르고(각각 하루 1번), 펫이 지금
 * 기다리고 있는 상대방이면 반응·기록에만 남는다(방문당 각각 1번). */
export function interactWithPet(ownerUid: string, petId: string, kind: 'pet' | 'snack'): Promise<InteractResult> {
  return callPetAction({ action: 'interact', ownerUid, petId, kind });
}

/** "뭐라고 했어?" — 손상된 메시지를 보낸 사람에게 다시 물어본다(메시지당 1번). */
export function reaskLetter(letterId: string, part: 'outbound' | 'reply'): Promise<{ ok: true }> {
  return callPetAction({ action: 'reask', letterId, part });
}
