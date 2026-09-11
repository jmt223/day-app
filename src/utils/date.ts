import { Timestamp } from '@firebase/firestore';

import { getLocale, t } from '@/i18n/store';

/**
 * DAY 앱의 "작성 시간 제한"은 한국 표준시(KST, UTC+9) 기준으로 판정한다.
 * 기기 시간대와 무관하게 항상 동일한 결과를 내기 위해, 모든 계산은
 * UTC epoch 위에서 +9시간 오프셋을 직접 더하고 빼는 방식으로 처리한다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 지금 이 순간을 KST 벽시계 기준 Date 값으로 변환한다 (표시 전용, UTC 필드로 읽어야 함). */
export function nowAsKstWallClock(): Date {
  return new Date(Date.now() + KST_OFFSET_MS);
}

/** 'YYYY-MM-DD' (KST) 형태의 오늘 날짜 라벨. */
export function todayKstLabel(): string {
  return dateToKstLabel(nowAsKstWallClock());
}

/** KST 벽시계로 취급되는 Date에서 'YYYY-MM-DD'를 뽑는다 (UTC getter 사용 주의). */
function dateToKstLabel(kstWallClock: Date): string {
  const y = kstWallClock.getUTCFullYear();
  const m = String(kstWallClock.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kstWallClock.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' 라벨이 가리키는 KST 자정의 실제 UTC 순간(Date)을 만든다. */
export function kstLabelToUtcMidnight(label: string): Date {
  const [y, m, d] = label.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, -9, 0, 0));
}

export function kstLabelToTimestamp(label: string): Timestamp {
  return Timestamp.fromDate(kstLabelToUtcMidnight(label));
}

const WEEKDAY_KEYS = [
  'date.weekdaySun',
  'date.weekdayMon',
  'date.weekdayTue',
  'date.weekdayWed',
  'date.weekdayThu',
  'date.weekdayFri',
  'date.weekdaySat',
] as const;

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 요일 표시 라벨 7개(일~토), 현재 언어 기준. 달력 헤더처럼 요일 이름을
 * 그대로 나열해야 하는 곳에서 쓴다. */
export function weekdayLabels(): string[] {
  return WEEKDAY_KEYS.map((key) => t(key));
}

/**
 * 'YYYY-MM-DD' 라벨 자체의 요일 인덱스(0=일 ~ 6=토).
 * 주의: kstLabelToUtcMidnight(label)의 결과는 "그 라벨의 KST 자정"이라는 UTC
 * 인스턴트(전날 15:00Z)이므로, 그 값에 .getUTCDay()를 쓰면 하루 전 요일이
 * 나온다. 요일은 시간대와 무관한 달력 계산이므로 반드시 Y/M/D를 그대로
 * Date.UTC에 넣어(시 오프셋 없이) 구해야 한다.
 */
function weekdayIndexOfLabel(label: string): number {
  const [y, m, d] = label.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 'YYYY-MM-DD' 라벨을 "2026년 8월 26일 · 수요일"(한국어) 또는
 * "August 26, 2026 · Wednesday"(영어) 형태로. */
export function formatDayLabelKorean(label: string): string {
  const [y, m, d] = label.split('-').map(Number);
  const weekday = t(WEEKDAY_KEYS[weekdayIndexOfLabel(label)]);
  if (getLocale() === 'en') {
    return `${MONTH_NAMES_EN[m - 1]} ${d}, ${y} · ${weekday}`;
  }
  return `${y}년 ${m}월 ${d}일 · ${weekday}요일`;
}

/** "2026년 9월"(한국어) 또는 "September 2026"(영어) — 달력 월 이동 헤더용. */
export function formatYearMonth(year: number, month1to12: number): string {
  if (getLocale() === 'en') {
    return `${MONTH_NAMES_EN[month1to12 - 1]} ${year}`;
  }
  return `${year}년 ${month1to12}월`;
}

export function formatDayLabelShort(label: string): string {
  return label.replaceAll('-', '.');
}

/** 작성 마감: 해당 날짜 00:00 KST ~ 다음날 10:00 KST (34시간). */
export function writeWindowEndsAt(label: string): Date {
  const start = kstLabelToUtcMidnight(label);
  return new Date(start.getTime() + 34 * 60 * 60 * 1000);
}

export function isWritableNow(label: string): boolean {
  const start = kstLabelToUtcMidnight(label);
  const end = writeWindowEndsAt(label);
  const now = Date.now();
  return now >= start.getTime() && now <= end.getTime();
}

/** label이 가리키는 날짜가 아직 시작 전(미래)인지. 예정된(draft) DAY를
 * 만들 수 있는 날짜인지 판단할 때 쓴다. */
export function isFutureLabel(label: string): boolean {
  return kstLabelToUtcMidnight(label).getTime() > Date.now();
}

/** 남은 작성 시간을 "3시간 12분" 같은 문자열로. 마감 지났으면 null. */
export function formatRemainingWriteTime(label: string): string | null {
  const end = writeWindowEndsAt(label);
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return t('date.hoursAndMinutes', { h: hours, m: minutes });
  return t('date.minutesOnly', { m: minutes });
}

export function addDaysToLabel(label: string, amount: number): string {
  const d = kstLabelToUtcMidnight(label);
  d.setUTCDate(d.getUTCDate() + amount);
  return dateToKstLabel(new Date(d.getTime() + KST_OFFSET_MS));
}

export function monthRangeLabels(year: number, month1to12: number): { startLabel: string; endLabelExclusive: string } {
  const start = `${year}-${String(month1to12).padStart(2, '0')}-01`;
  const nextMonth = month1to12 === 12 ? 1 : month1to12 + 1;
  const nextYear = month1to12 === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { startLabel: start, endLabelExclusive: end };
}

export type MonthGridCell = { label: string | null; day: number | null };

/** 6주(42칸) 그리드. 앞뒤 여백 칸은 label=null. */
export function getMonthGrid(year: number, month1to12: number): MonthGridCell[] {
  const firstWeekday = weekdayIndexOfLabel(`${year}-${String(month1to12).padStart(2, '0')}-01`);
  const daysInMonth = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();

  const cells: MonthGridCell[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ label: null, day: null });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ label: `${year}-${String(month1to12).padStart(2, '0')}-${String(day).padStart(2, '0')}`, day });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ label: null, day: null });
  }
  return cells;
}

export function relativeTimeFromNow(timestamp: Timestamp | null): string {
  if (!timestamp) return '';
  const diffMs = Date.now() - timestamp.toMillis();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return t('date.justNow');
  if (diffMs < hour) return t('date.minutesAgo', { n: Math.floor(diffMs / minute) });
  if (diffMs < day) return t('date.hoursAgo', { n: Math.floor(diffMs / hour) });
  if (diffMs < 30 * day) return t('date.daysAgo', { n: Math.floor(diffMs / day) });
  return formatDayLabelShort(dateToKstLabel(new Date(timestamp.toMillis() + KST_OFFSET_MS)));
}

/** "설정일자"(dateLabel, 날짜만)와 구분되는 "작성일자" — 실제로 쓴 시각을
 * 날짜+시간까지 그대로 보여준다(예: "2026.08.15 14:32"). KST 기준. */
export function formatWrittenAtKorean(timestamp: Timestamp | null): string {
  if (!timestamp) return '';
  const kst = new Date(timestamp.toMillis() + KST_OFFSET_MS);
  const label = dateToKstLabel(kst);
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${formatDayLabelShort(label)} ${hh}:${mm}`;
}
