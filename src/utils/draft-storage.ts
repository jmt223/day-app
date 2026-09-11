import AsyncStorage from '@react-native-async-storage/async-storage';

import { moodOptions } from '@/constants/mood';
import type { DayLocation, DayVisibility, MoodKey, TextAlignKey } from '@/types/day';
import { DEFAULT_FONT_PRESET, FONT_PRESETS, type FontPresetKey } from '@/constants/theme';

const VALID_FONT_KEYS = new Set(Object.keys(FONT_PRESETS));
const VALID_TEXT_ALIGNS = new Set<TextAlignKey>(['left', 'center', 'right']);
const VALID_VISIBILITIES = new Set<DayVisibility>(['public', 'friends', 'group', 'private']);
// mood.ts의 실제 감정 목록에서 그대로 가져온다 — 여기 따로 손으로 목록을
// 다시 적으면, mood.ts에 새 감정을 추가할 때마다 여기도 잊지 않고
// 맞춰줘야 하는데 그게 한 번 어긋나면(실제로 5개→10개로 늘렸을 때처럼)
// 새 감정으로 임시저장한 글이 불러올 때 조용히 null로 지워지는 버그가
// 생긴다.
const VALID_MOODS = new Set(moodOptions().map((m) => m.key));

const KEY_PREFIX = 'day-draft:';

/**
 * 글쓰기 화면의 임시저장. 사진은 뺀다 — 로컬 사진 경로는 웹에서 새로고침하면
 * (blob: URL이 무효화됨) 아예 못 살리고, 네이티브에서도 앱을 완전히 지웠다
 * 새로 깔면 캐시 경로가 살아있다는 보장이 없다. 그래서 다시 복구해도 믿을 수
 * 있는 텍스트/설정값만 저장한다.
 */
export type DraftPayload = {
  dateLabel: string;
  title: string;
  /** 사진 블록은 빼고, 텍스트 블록의 내용만 순서대로. */
  textBlocks: string[];
  mood: MoodKey | null;
  location: DayLocation | null;
  fontKey: FontPresetKey;
  textAlign: TextAlignKey;
  visibility: DayVisibility;
  groupId: string | null;
  inWorldFeed: boolean;
  inHistory: boolean;
  taggedUids: string[];
  hadPhotos: boolean;
  savedAt: number;
};

export function draftHasContent(draft: Pick<DraftPayload, 'title' | 'textBlocks'>): boolean {
  return draft.title.trim().length > 0 || draft.textBlocks.some((t) => t.trim().length > 0);
}

export async function saveDraft(uid: string, draft: DraftPayload): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + uid, JSON.stringify(draft));
  } catch {
    // 임시저장은 있으면 좋은 보조 기능이지 핵심 기능이 아니다 — 실패해도
    // 조용히 넘어가고 글쓰기 자체를 막지 않는다.
  }
}

/**
 * 저장된 임시저장은 그냥 JSON.parse만 거친 값이라 형식을 보장 못 한다 —
 * 예전 버전에서 저장된(필드가 아예 없던 시절) 드래프트나, 브라우저
 * 로컬스토리지에 남아있던 손상된 값일 수 있다. fontKey처럼 열거값이 깨진
 * 채로 글쓰기 화면 상태에 그대로 들어가면 FONT_PRESETS[fontKey]에서 화면이
 * 죽거나(모르는 값), Firestore 규칙이 유효한 프리셋만 허용하도록 막아놔서
 * (firestore.rules 참고) 제출이 permission-denied로 실패한다. 그래서
 * 복원하기 전에 여기서 한 번 더 안전한 값으로 정리한다.
 */
function sanitizeDraft(raw: unknown): DraftPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<DraftPayload>;
  if (typeof d.dateLabel !== 'string' || typeof d.title !== 'string' || !Array.isArray(d.textBlocks)) return null;

  return {
    dateLabel: d.dateLabel,
    title: d.title,
    textBlocks: d.textBlocks.filter((t): t is string => typeof t === 'string'),
    mood: d.mood && VALID_MOODS.has(d.mood) ? d.mood : null,
    location:
      d.location && typeof d.location.lat === 'number' && typeof d.location.lng === 'number' && typeof d.location.name === 'string'
        ? d.location
        : null,
    fontKey: d.fontKey && VALID_FONT_KEYS.has(d.fontKey) ? d.fontKey : DEFAULT_FONT_PRESET,
    textAlign: d.textAlign && VALID_TEXT_ALIGNS.has(d.textAlign) ? d.textAlign : 'left',
    visibility: d.visibility && VALID_VISIBILITIES.has(d.visibility) ? d.visibility : 'public',
    groupId: typeof d.groupId === 'string' ? d.groupId : null,
    inWorldFeed: typeof d.inWorldFeed === 'boolean' ? d.inWorldFeed : true,
    inHistory: typeof d.inHistory === 'boolean' ? d.inHistory : true,
    taggedUids: Array.isArray(d.taggedUids) ? d.taggedUids.filter((u): u is string => typeof u === 'string') : [],
    hadPhotos: !!d.hadPhotos,
    savedAt: typeof d.savedAt === 'number' ? d.savedAt : Date.now(),
  };
}

export async function loadDraft(uid: string): Promise<DraftPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + uid);
    return raw ? sanitizeDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function clearDraft(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + uid);
  } catch {
    // ignore
  }
}
