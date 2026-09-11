/**
 * 월드 데이 상단에 보여줄 "오늘은 원래 무슨 날인지" 목록. 사용자가 만든
 * DAY와 달리 서버 계산이 필요 없는, 매년 반복되는 양력 고정 날짜라 그냥
 * 상수로 들고 있는다(24절기처럼 해마다 날짜가 바뀌는 것과 설/추석 같은
 * 음력 기념일은 계산이 훨씬 복잡해져서 1차 범위에선 뺐다).
 *
 * name/nameEn은 각각 한국어/영어 화면에 그대로 보여줄 표시용 문구다.
 */
export type OfficialDay = {
  month: number; // 1-12
  day: number;
  name: string;
  nameEn: string;
  icon: string;
};

export const OFFICIAL_DAYS: OfficialDay[] = [
  { month: 1, day: 1, name: '새해', nameEn: "New Year's Day", icon: '🎉' },
  { month: 2, day: 14, name: '발렌타인데이', nameEn: "Valentine's Day", icon: '🍫' },
  { month: 3, day: 3, name: '삼겹살데이', nameEn: 'Samgyeopsal Day', icon: '🥓' },
  { month: 3, day: 8, name: '세계 여성의 날', nameEn: "International Women's Day", icon: '🌷' },
  { month: 3, day: 14, name: '화이트데이', nameEn: 'White Day', icon: '🍬' },
  { month: 4, day: 5, name: '식목일', nameEn: 'Arbor Day', icon: '🌳' },
  { month: 4, day: 14, name: '블랙데이', nameEn: 'Black Day', icon: '🖤' },
  { month: 5, day: 1, name: '근로자의 날', nameEn: "Worker's Day", icon: '💼' },
  { month: 5, day: 5, name: '어린이날', nameEn: "Children's Day", icon: '🎈' },
  { month: 5, day: 8, name: '어버이날', nameEn: "Parents' Day", icon: '💐' },
  { month: 5, day: 15, name: '스승의날', nameEn: "Teachers' Day", icon: '🍎' },
  { month: 5, day: 20, name: '부부의날', nameEn: "Couples' Day", icon: '💑' },
  { month: 6, day: 6, name: '현충일', nameEn: 'Memorial Day', icon: '🕊️' },
  { month: 7, day: 7, name: '칠석', nameEn: 'Chilseok', icon: '⭐' },
  { month: 8, day: 15, name: '광복절', nameEn: 'Liberation Day', icon: '🇰🇷' },
  { month: 9, day: 9, name: '구구데이', nameEn: 'Chicken Day', icon: '🍗' },
  { month: 10, day: 3, name: '개천절', nameEn: 'National Foundation Day', icon: '🏔️' },
  { month: 10, day: 9, name: '한글날', nameEn: 'Hangul Day', icon: '🇰🇷' },
  { month: 10, day: 31, name: '할로윈', nameEn: 'Halloween', icon: '🎃' },
  { month: 11, day: 11, name: '빼빼로데이', nameEn: 'Pepero Day', icon: '🍫' },
  { month: 12, day: 25, name: '크리스마스', nameEn: 'Christmas', icon: '🎄' },
  { month: 12, day: 31, name: '한 해의 마지막 날', nameEn: "New Year's Eve", icon: '✨' },
];

/** month(1-12)/day가 오늘과 같은 공식 기념일을 전부 찾는다(같은 날짜에
 * 여러 개가 겹칠 수 있어 배열로 반환 — 예: 이 목록엔 없지만 향후 추가 시
 * 대비). */
export function officialDaysOn(month: number, day: number): OfficialDay[] {
  return OFFICIAL_DAYS.filter((d) => d.month === month && d.day === day);
}
