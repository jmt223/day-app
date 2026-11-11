/**
 * 펫 편지 기능의 "순수 계산" 모음 — Firestore를 전혀 모르고, 입력만 받아서
 * 결과를 돌려준다. 그래서 에뮬레이터 없이도 그대로 단위 테스트할 수 있다.
 *
 * 텍스트를 6칸으로 나누는 규칙(textCells)은 클라이언트
 * src/utils/letter-damage.ts의 textCells와 글자 하나까지 똑같아야 한다 —
 * 서버가 "몇 번 칸이 손상됐는지"만 저장하고, 실제로 어느 글자를 가릴지는
 * 화면이 같은 규칙으로 다시 나눠서 정하기 때문이다(그래야 다시 열어도,
 * 다른 기기로 봐도 같은 글자가 가려진다).
 */

const CELL_COUNT = 6;

/**
 * 메시지를 가로 3 × 세로 2 = 6칸으로 나눈다. 화면 픽셀이 아니라 "글자" 기준이다
 * — 화면 폭에 따라 줄바꿈 위치가 달라져도 같은 칸에는 항상 같은 글자가 들어간다.
 * 0~2번 칸 = 앞쪽 절반(윗줄 왼쪽→오른쪽), 3~5번 칸 = 뒤쪽 절반(아랫줄).
 * Array.from으로 코드포인트 단위로 자르니 한글/이모지가 반쪽으로 깨지지 않는다.
 */
function textCells(text) {
  const chars = Array.from(text || '');
  const n = chars.length;
  const cells = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const start = Math.floor((i * n) / CELL_COUNT);
    const end = Math.floor(((i + 1) * n) / CELL_COUNT);
    cells.push(chars.slice(start, end).join(''));
  }
  return cells;
}

/** 손상 추첨 대상이 될 수 있는 칸 — 비어있거나 공백뿐인 칸은 가려도 아무것도
 * 안 보이니(짧은 메시지에서 생긴다) 처음부터 후보에서 뺀다. */
function damageCandidateCells(text) {
  return textCells(text)
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell.trim().length > 0)
    .map(({ index }) => index);
}

function personalityRule(rules, personality) {
  return (rules.personalities && rules.personalities[personality]) || rules.personalities.easygoing || {};
}

/** 최종 손상 확률(%) = 성격별 기본 확률 − 친밀도 × 0.04%p, 최소 1%. */
function damagePercent(personality, intimacy, rules) {
  const base = personalityRule(rules, personality).baseDamagePercent ?? 5;
  const reduced = base - (intimacy || 0) * rules.intimacyDamageReductionPerPoint;
  return Math.max(rules.minDamagePercent, reduced);
}

function pickWeighted(weights, rng) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    if (roll < weights[i]) return i;
    roll -= weights[i];
  }
  return weights.length - 1;
}

/**
 * 메시지 하나의 손상을 추첨한다. 손상이 안 나면 [], 나면 손상된 칸 번호(오름차순).
 * 칸 수는 damageCellWeights(1칸 65% … 6칸 1%)로 뽑고, 후보 칸보다 많이 뽑히면
 * 후보 칸 수로 줄인다. 위치는 후보 안에서 중복 없이 고른다.
 */
function rollDamageCells(text, personality, intimacy, rules, rng = Math.random) {
  const candidates = damageCandidateCells(text);
  if (candidates.length === 0) return [];
  if (rng() * 100 >= damagePercent(personality, intimacy, rules)) return [];

  const count = Math.min(pickWeighted(rules.damageCellWeights, rng) + 1, candidates.length);
  const pool = candidates.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

/**
 * 성격별 예외 행동. 친밀도와 무관하게 성격 확률만 본다.
 *  - 서두르는(hasty): 일정 확률로 대기시간의 50~80% 시점에 먼저 돌아온다.
 *  - 여유로운(easygoing): 일정 확률로 시간이 끝나도 안 돌아오고 계속 머문다.
 * 나머지 성격은 아직 예외 행동이 정해지지 않았다(기획 미정).
 */
function rollBehavior(personality, rules, rng = Math.random) {
  const rule = personalityRule(rules, personality);
  if (rule.earlyReturnChancePercent && rng() * 100 < rule.earlyReturnChancePercent) {
    const min = rule.earlyReturnMinRatio ?? 0.5;
    const max = rule.earlyReturnMaxRatio ?? 0.8;
    return { behavior: 'early_return', ratio: min + rng() * (max - min) };
  }
  if (rule.overstayChancePercent && rng() * 100 < rule.overstayChancePercent) {
    return { behavior: 'overstay', ratio: null };
  }
  return { behavior: 'normal', ratio: null };
}

/** KST 기준 'YYYY-MM-DD' — 친밀도 "하루 최대"의 하루 경계. */
function kstDayLabel(ms) {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function freshDaily(today) {
  return { day: today, deliveryGains: 0, petted: false, snacked: false, total: 0 };
}

/**
 * 친밀도 상승을 계산한다(실제 저장은 호출한 쪽이 한다).
 *  - delivery: 배달 후 복귀 완료, 하루 최대 deliveryGainDailyMax번
 *  - pet / snack: 주인이 쓰다듬기·간식 주기, 각각 하루 1번
 *  - 모든 경로 합쳐 하루 최대 dailyMax, 전체 최대 max(100)
 * pet/snack을 오늘 이미 했으면 { allowed: false }. delivery는 상한에
 * 걸려도 복귀 자체는 되어야 하니 allowed는 항상 true다(상승분만 0).
 */
function applyIntimacyGain(pet, kind, nowMs, rules) {
  const cfg = rules.intimacy;
  const today = kstDayLabel(nowMs);
  const daily = pet && pet.daily && pet.daily.day === today ? { ...freshDaily(today), ...pet.daily } : freshDaily(today);
  const intimacy = (pet && pet.intimacy) || 0;

  let gain = 0;
  if (kind === 'delivery') {
    if (daily.deliveryGains < cfg.deliveryGainDailyMax) {
      daily.deliveryGains += 1;
      gain = cfg.deliveryGain;
    }
  } else if (kind === 'pet' || kind === 'snack') {
    const flag = kind === 'pet' ? 'petted' : 'snacked';
    if (daily[flag]) return { allowed: false, gained: 0, intimacy, daily };
    daily[flag] = true;
    gain = kind === 'pet' ? cfg.petGain : cfg.snackGain;
  }

  const room = Math.max(0, Math.min(cfg.dailyMax - daily.total, cfg.max - intimacy));
  const gained = Math.max(0, Math.min(gain, room));
  daily.total += gained;
  return { allowed: true, gained, intimacy: intimacy + gained, daily };
}

/** 한국어 조사(이/가, 을/를, 은/는)를 이름 끝 글자 받침에 맞춰 붙인다. 한글이
 * 아닌 이름(영문 등)은 받침 없는 쪽으로 붙인다. */
function withJosa(word, pair) {
  const [withBatchim, withoutBatchim] = pair.split('/');
  const text = String(word || '');
  const code = text.charCodeAt(text.length - 1);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  const hasBatchim = isHangul && (code - 0xac00) % 28 !== 0;
  return `${text}${hasBatchim ? withBatchim : withoutBatchim}`;
}

module.exports = {
  CELL_COUNT,
  textCells,
  damageCandidateCells,
  damagePercent,
  rollDamageCells,
  rollBehavior,
  kstDayLabel,
  applyIntimacyGain,
  withJosa,
};
