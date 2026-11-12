/** 시드 생성기 공용 도구: 재현 가능한 난수, KST 날짜 계산. */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const KST = 9 * HOUR;

/** 같은 시드면 항상 같은 순서로 나오는 난수(mulberry32) — 다시 돌려도 같은 사람·같은
 * 글 구성이 나와서, 문서 ID가 그대로 덮어써진다(중복으로 쌓이지 않음). */
class Rng {
  constructor(seed) {
    this.state = seed >>> 0;
  }
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** a 이상 b 이하 정수 */
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  sample(arr, n) {
    return this.shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length)));
  }
  /** [[값, 가중치], ...] 중 하나 */
  weighted(pairs) {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let roll = this.next() * total;
    for (const [value, w] of pairs) {
      if (roll < w) return value;
      roll -= w;
    }
    return pairs[pairs.length - 1][0];
  }
  token() {
    const hex = () => Math.floor(this.next() * 0x100000000).toString(16).padStart(8, '0');
    const s = hex() + hex() + hex() + hex();
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
  }
}

/** ms → KST 기준 'YYYY-MM-DD' */
function kstLabel(ms) {
  const d = new Date(ms + KST);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD'(KST)의 자정을 가리키는 실제 시각(ms) */
function kstMidnightMs(label) {
  const [y, m, d] = label.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - KST;
}

function addDays(label, n) {
  return kstLabel(kstMidnightMs(label) + n * DAY + HOUR);
}

function monthOf(label) {
  return Number(label.split('-')[1]);
}

function pad(n, width) {
  return String(n).padStart(width, '0');
}

module.exports = { MIN, HOUR, DAY, Rng, kstLabel, kstMidnightMs, addDays, monthOf, pad };
