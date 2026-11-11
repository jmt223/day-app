import { getLocale } from '@/i18n/store';

/** 한국어 조사(이/가, 을/를, 은/는, 와/과)를 이름 끝 글자 받침에 맞춰 붙인다.
 * 한글이 아닌 이름(영문 등)은 받침 없는 쪽으로 붙인다. functions/pet-logic.js의
 * withJosa와 같은 규칙. */
function withJosa(word: string, pair: '이/가' | '을/를' | '은/는' | '와/과'): string {
  const [withBatchim, withoutBatchim] = pair.split('/');
  const code = word.charCodeAt(word.length - 1);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  const hasBatchim = isHangul && (code - 0xac00) % 28 !== 0;
  return `${word}${hasBatchim ? withBatchim : withoutBatchim}`;
}

/** 번역 문구의 {{pet}} 자리에 넣을 값. 한국어 문구는 조사까지 붙여서
 * ("두부가", "초롱이"), 영어 문구는 이름만 넣는다. */
export function petName(name: string, pair: '이/가' | '을/를' | '은/는' | '와/과' = '이/가'): string {
  return getLocale() === 'ko' ? withJosa(name, pair) : name;
}
