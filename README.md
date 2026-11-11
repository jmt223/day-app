# DAY

> 당신의 모든 날이, 하나의 DAY가 됩니다.

날짜를 중심으로 기록과 관계를 쌓아가는 SNS. React Native(Expo) + Firebase로 만들었습니다.

## 시작하기

1. 의존성 설치: `npm install` (Cloud Functions는 `cd functions && npm install`)
2. Firebase 연결: [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)를 따라 `.env`와 `functions/.env`를 채웁니다.
3. 앱 실행: `npx expo start`

Expo Go 앱으로 QR코드를 스캔하거나, 터미널에서 `i`(iOS 시뮬레이터) / `a`(Android 에뮬레이터) / `w`(웹)를 눌러 실행하세요.

## 스택

- **Expo Router**로 화면을 구성 (`src/app`)
- **Firebase** Authentication(이메일/비밀번호 · Google · Kakao) · Firestore · Storage · Cloud Functions(2세대, `asia-northeast3`)
- 폰트: Gowun Batang(세리프) / Gowun Dodum(산세리프) — 따뜻하고 사적인 다이어리 톤. 편지 말풍선은 나눔손글씨 펜.

## 폴더 구조

```
src/
  app/            expo-router 화면 (파일 = 라우트)
  components/     재사용 UI 컴포넌트
  constants/      색상·타이포·간격 토큰, 무드 태그, 펫 종/성격/손상 표현
  content/        이용약관 · 개인정보처리방침 본문
  context/        인증 · 언어 · 테마 컨텍스트
  data/           Firestore/Storage 읽기·쓰기, Cloud Function 호출
  hooks/          커스텀 훅
  i18n/           한국어/영어 문구
  lib/            Firebase 초기화, 환경변수, 함수 주소
  types/          공용 타입
  utils/          날짜(KST), 편지 손상 표시, 조사(이/가) 등 유틸
functions/
  index.js        트리거·스케줄·HTTP 함수 연결
  letters-core.js 펫 편지 서버 로직(도착/답장/자동 복귀/회수/쓰다듬기/재문의)
  pet-logic.js    손상·친밀도·성격 행동 계산(순수 함수)
  pet-config.js   확률·수치 기본값 + config/petRules 덮어쓰기
firestore.rules            Firestore 보안 규칙(서버 역할의 대부분을 여기서 한다)
firestore.indexes.json     Firestore 복합 인덱스
storage.rules              Storage 보안 규칙
```

## 주요 기능

- **DAY 쓰기**: 글·사진(최대 3장)이 섞인 본문, 기분, 위치, 글씨체, 친구 태그. 그 날짜 0시 ~ 다음날 오전 10시(KST)까지만 쓸 수 있고(보안 규칙에서 서버 시간으로 강제), 미래 날짜는 예정 DAY로 써두었다가 그날 확정한다.
- **월드 데이(홈)**: 오늘의 DAY(내가 오늘 쓴 DAY 이름이 상단에 뜸), 친구 DAY, 오늘의 인기 DAY, 새로운 DAY(게시판형 `제목 [댓글수]`).
- **내 연혁**: 달력/타임라인, 감정 흐름, 업데이트한 친구(최근 연혁에 새 DAY를 올린 친구, 안 본 소식엔 점).
- **친구**: 이메일로 요청 → 수락, 그룹, 차단, 신고.
- **펫 편지**: 편지함(친구별 대화창)과 내 펫. 펫이 메시지를 물고 가서 상대 곁에서 답장을 기다린다. 자세한 규칙은 [FIREBASE_SETUP.md의 "펫 편지"](./FIREBASE_SETUP.md#펫-편지)를 보세요.
- **알림**: 앱 안 알림함 + 푸시(Expo), 1년 전 오늘 회고 알림.

## 테스트

로컬 에뮬레이터(운영 서버와 무관한 `demo-` 프로젝트)로 보안 규칙과 Cloud Functions를 같이 돌려볼 수 있습니다. 방법은 [FIREBASE_SETUP.md](./FIREBASE_SETUP.md#로컬-에뮬레이터)에 있습니다.

```bash
npx tsc --noEmit   # 타입 검사
npx expo lint      # 린트
```
