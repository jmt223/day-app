// 이 파일이 "모듈"로 취급되어야 아래 declare module이 실제 타입을 덮어쓰지 않고
// 보강(augmentation)된다 (export {}가 없으면 앰비언트 선언으로 취급되어
// @firebase/auth의 진짜 타입을 통째로 가려버린다).
export {};

// @firebase/auth의 공개 타입 진입점(auth-public.d.ts)에는 React Native 전용
// getReactNativePersistence가 빠져 있다 (런타임 번들에는 존재함 - Metro가
// "react-native" 조건으로 dist/rn/index.js를 올바르게 골라 사용한다).
// 타입 체크만을 위한 최소 보강.
declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: unknown): import('@firebase/auth').Persistence;
}
