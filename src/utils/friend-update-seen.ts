import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * "업데이트한 친구"의 새 소식 점(•)을 어디까지 봤는지 — 친구별로 "마지막으로
 * 본 업데이트 시각"을 이 기기에 저장한다. 서버에 남길 만큼 중요한 값은 아니라서
 * (다른 기기에선 점이 한 번 더 보일 뿐) 로컬 저장소로 충분하다.
 */
function storageKey(myUid: string): string {
  return `day-app:friend-history-seen:${myUid}`;
}

export type SeenMap = Record<string, number>;

export async function loadSeenMap(myUid: string): Promise<SeenMap> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(myUid));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as SeenMap) : {};
  } catch {
    return {};
  }
}

export async function markFriendHistorySeen(myUid: string, friendUid: string, atMs: number = Date.now()): Promise<void> {
  try {
    const map = await loadSeenMap(myUid);
    if ((map[friendUid] ?? 0) >= atMs) return;
    map[friendUid] = atMs;
    await AsyncStorage.setItem(storageKey(myUid), JSON.stringify(map));
  } catch {
    // 못 저장해도 점이 한 번 더 보일 뿐이라 조용히 넘어간다.
  }
}
