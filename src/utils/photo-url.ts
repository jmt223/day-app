import { functionUrl } from '@/lib/functions-url';

// servePhoto Cloud Function(functions/index.js)의 주소. asia-northeast3
// 리전의 2nd gen 함수라 firebase-functions SDK 없이도 그냥 fetch로 부를 수
// 있는 평범한 HTTPS 엔드포인트다.
const SERVE_PHOTO_URL = functionUrl('servePhoto');

/**
 * DAY 사진을 가리키는 값(Storage 경로, 혹은 예전에 저장해둔 전체 다운로드
 * URL)을 받아서, 인증 헤더를 실어 호출해야 하는 servePhoto 프록시 주소를
 * 만든다. 실제 파일 바이트를 받으려면 반드시 `Authorization: Bearer <ID
 * 토큰>` 헤더와 함께 호출해야 한다 — 이 URL 자체는 예전 공개 다운로드
 * URL과 달리 아무나 열어볼 수 있는 링크가 아니다.
 */
export function photoProxyUrl(pathOrLegacyUrl: string): string {
  return `${SERVE_PHOTO_URL}?path=${encodeURIComponent(pathOrLegacyUrl)}`;
}
