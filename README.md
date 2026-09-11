# DAY

> 당신의 모든 날이, 하나의 DAY가 됩니다.

날짜를 중심으로 기록과 관계를 쌓아가는 SNS. React Native(Expo) + Firebase로 만든 1차 MVP입니다.

## 시작하기

1. 의존성 설치: `npm install`
2. Firebase 연결: [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)를 따라 `.env`를 채웁니다.
3. 앱 실행: `npx expo start`

Expo Go 앱으로 QR코드를 스캔하거나, 터미널에서 `i`(iOS 시뮬레이터) / `a`(Android 에뮬레이터) / `w`(웹)를 눌러 실행하세요.

## 스택

- **Expo Router**로 화면을 구성 (`src/app`)
- **Firebase** Authentication(이메일/비밀번호) · Firestore · Storage
- 폰트: Gowun Batang(세리프) / Gowun Dodum(산세리프) — 따뜻하고 사적인 다이어리 톤

## 폴더 구조

```
src/
  app/            expo-router 화면 (파일 = 라우트)
  components/     재사용 UI 컴포넌트
  constants/      색상·타이포·간격 토큰, 무드 태그 정의
  context/        인증 컨텍스트
  data/           Firestore/Storage 읽기·쓰기 함수
  hooks/          테마 등 커스텀 훅
  lib/            Firebase 초기화, 환경변수
  types/          공용 타입
  utils/          날짜(KST) 계산 유틸
firestore.rules            Firestore 보안 규칙
firestore.indexes.json     Firestore 복합 인덱스
storage.rules              Storage 보안 규칙
```

## 구현 범위 (1차 MVP)

PRD 13장의 1차 MVP 항목을 기준으로 구현했습니다: 회원가입/로그인(이메일), 월드 데이(홈), DAY 작성(사진 업로드 포함), DAY 상세, 내 연혁(달력/연혁 보기), 친구 추가 및 그룹(리스트형), 공개범위 설정, 좋아요/댓글, 프로필, 알림, 그리고 **서버 시간 기준 작성 시간 제한**(오늘 날짜 DAY는 다음날 오전 10시까지만 작성 가능 — Firestore 보안 규칙에서 `request.time`으로 강제하므로 기기 시간을 바꿔도 우회할 수 없습니다).

2차/3차 개발 항목과 알려진 제약사항은 [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) 하단을 참고하세요.
