/**
 * 펫 편지 기능의 확률·수치 설정값.
 *
 * 기획서의 "운영하면서 조정할 수 있도록 설정값으로 관리" 요구사항 때문에,
 * 코드에 박힌 기본값(DEFAULT_PET_RULES) 위에 Firestore의 config/petRules
 * 문서 값을 덮어써서 쓴다. 그래서 Firebase 콘솔에서 그 문서의 숫자만
 * 바꾸면 재배포 없이 바로(최대 1분 캐시 후) 반영된다. 문서가 없으면 기본값
 * 그대로 동작한다.
 *
 * 클라이언트(src/constants/pets.ts의 DEFAULT_PET_RULES)에도 같은 기본값이
 * 있다 — 화면에 "손상 확률 N%"를 보여줄 때만 쓰고, 실제 추첨은 항상 여기
 * 서버 값으로만 한다.
 */

const DEFAULT_PET_RULES = {
  personalities: {
    // 기획서 제안값
    hasty: { baseDamagePercent: 6, earlyReturnChancePercent: 10, earlyReturnMinRatio: 0.5, earlyReturnMaxRatio: 0.8 },
    easygoing: { baseDamagePercent: 5, overstayChancePercent: 10 },
    // 기획서에 수치가 비어 있던 성격 — 개발 쪽 임시 제안값(예외 행동 없음)
    careful: { baseDamagePercent: 3 },
    playful: { baseDamagePercent: 8 },
    timid: { baseDamagePercent: 5 },
    reliable: { baseDamagePercent: 4 },
  },
  /** 친밀도 1당 손상 확률 감소(%p). */
  intimacyDamageReductionPerPoint: 0.04,
  /** 친밀도가 아무리 높아도 이 아래로는 안 내려간다(%). */
  minDamagePercent: 1,
  /** 손상이 났을 때 1칸~6칸이 나올 가중치. */
  damageCellWeights: [65, 20, 8, 4, 2, 1],
  intimacy: {
    max: 100,
    deliveryGain: 1,
    deliveryGainDailyMax: 3,
    petGain: 1,
    snackGain: 1,
    dailyMax: 5,
  },
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 기본값 위에 override를 깊게 덮어쓴다. 배열은 통째로 교체한다. 타입이 다른
 * 값(예: 숫자 자리에 문자열)은 무시해서, 콘솔에서 오타를 내도 기능 전체가
 * 깨지지 않게 한다. */
function mergeRules(base, override) {
  if (!isPlainObject(override)) return base;
  const result = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = base[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      result[key] = mergeRules(current, value);
    } else if (current === undefined && isPlainObject(value)) {
      result[key] = value;
    } else if (Array.isArray(current) && Array.isArray(value) && value.every((v) => typeof v === 'number')) {
      result[key] = value;
    } else if (typeof current === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
    }
  }
  return result;
}

const CACHE_MS = 60 * 1000;

function createRulesLoader(db) {
  let cached = null;
  let cachedAt = 0;
  return async function getPetRules() {
    const now = Date.now();
    if (cached && now - cachedAt < CACHE_MS) return cached;
    try {
      const snap = await db.doc('config/petRules').get();
      cached = mergeRules(DEFAULT_PET_RULES, snap.exists ? snap.data() : null);
    } catch (err) {
      console.error('config/petRules를 읽지 못해서 기본값을 써요', err);
      cached = DEFAULT_PET_RULES;
    }
    cachedAt = now;
    return cached;
  };
}

module.exports = { DEFAULT_PET_RULES, mergeRules, createRulesLoader };
