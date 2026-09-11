# Firebase 설정 가이드

DAY 앱은 Firebase(Authentication, Firestore, Storage)를 백엔드로 사용합니다. 아래 순서대로 한 번만 설정하면 됩니다.

## 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 에서 새 프로젝트를 만듭니다.
2. 웹 앱을 하나 등록합니다. 콘솔 개편으로 위치가 자주 바뀌는데, 안 보이면 왼쪽 위 ⚙️(톱니바퀴) → **프로젝트 설정** → **일반** 탭 → **내 앱** 섹션 → **앱 추가** → **웹**을 선택하면 됩니다. (Firebase Hosting 체크박스는 필요 없습니다.)
3. "Firebase SDK 추가" 단계에서 **npm 사용** 탭을 선택하면 `firebaseConfig` 코드 블록이 나옵니다. 이 값을 복사해둡니다.

## 2. 환경변수 채우기

프로젝트 루트의 `.env.example`을 `.env`로 복사하고, 1번에서 확인한 값을 채워 넣습니다.

```
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
```

`.env`는 git에 커밋되지 않습니다.

## 3. Authentication 켜기

Firebase 콘솔 > Authentication > Sign-in method에서 **이메일/비밀번호**를 사용 설정합니다.

(소셜 로그인은 1차 MVP에는 포함하지 않았습니다. 아래 "알려진 제약사항" 참고)

## 4. Firestore Database 만들기

Firebase 콘솔 왼쪽 메뉴가 "데이터베이스 및 스토리지" 같은 카테고리로 묶여있을 수 있습니다. 그 안에서 **Firestore**(Realtime Database 아님)를 선택 → **Standard 버전** → 데이터베이스 만들기. 위치는 가능하면 `asia-northeast3(서울)`을 권장하지만, 프로젝트에 이미 리전이 고정되어 선택지가 안 뜨면 그냥 기본값으로 진행해도 무방합니다.

이 저장소에는 이미 작성된 보안 규칙(`firestore.rules`)과 인덱스 정의(`firestore.indexes.json`)가 있습니다. Firebase CLI로 그대로 배포하세요.

## 5. Storage 만들기

같은 카테고리 안의 **Storage** → 시작하기. 마찬가지로 `storage.rules`가 이미 준비되어 있습니다.

⚠️ 최근 Google 정책상 Storage를 만들려면 프로젝트가 **Blaze(종량제) 요금제**여야 할 수 있습니다. 업그레이드해도 무료 사용량 한도(5GB 저장 등)는 그대로라 일반적인 개발 단계에서는 비용이 발생하지 않습니다. 카드 등록이 꺼려지면 "무료 위치" 옵션이 뜨는지 먼저 확인해보세요 — 뜨면 업그레이드 없이도 생성됩니다.

## 6. 규칙 · 인덱스 배포 (Firebase CLI)

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # 방금 만든 프로젝트 선택
firebase deploy --only firestore:rules,firestore:indexes,storage
```

`firebase init`을 새로 실행할 필요는 없습니다. 이미 `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`이 준비되어 있습니다.

DAY 사진은 이제 공개 다운로드 URL 없이, `functions/` 폴더의 `servePhoto` Cloud Function을 통해서만 서빙됩니다. 이 프로젝트를 새로 세팅하는 경우 규칙과 함께 함수도 배포해야 합니다(Blaze 요금제 필요):

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

## 7. 앱 실행

```bash
npx expo start
```

터미널에 뜨는 QR코드를 Expo Go 앱으로 스캔하거나, `i`/`a`를 눌러 시뮬레이터로 실행하세요. `w`를 누르면 웹으로도 열립니다.

`.env`를 채우지 않고 실행하면 앱이 "Firebase 설정이 필요해요" 안내 화면만 보여주고 정상 동작하지 않습니다.

---

## 알려진 제약사항 (1차 MVP)

- **소셜 로그인(Apple/Google/Kakao)**: 실제 OAuth 클라이언트 등록이 필요해 이번 빌드에는 포함하지 않았습니다. 이메일/비밀번호 로그인은 완전히 동작합니다.
- **DAY 작성 날짜 선택**: 작성 시간 제한(당일 00:00~다음날 10:00 KST) 때문에 실제로 고를 의미가 있는 날짜는 "오늘"과, 아직 마감 전이라면 "어제"뿐입니다. 그래서 달력형 날짜 선택기 대신 오늘/어제 두 버튼으로 단순화했습니다 (네이티브 달력 선택기는 웹에서 아예 지원되지 않는 라이브러리라 원래 계획을 바꿨습니다).
- **친구 추가는 일방향입니다**: 이메일로 검색해서 내 목록에 바로 추가되는 방식이고(카톡 주소록과 비슷), 상대방에게 알림이 가거나 수락을 받는 절차는 없습니다. PRD에도 이 부분은 구체적으로 정해져 있지 않아 가장 단순한 방식으로 구현했습니다.
- **회원 탈퇴**: Authentication 계정 삭제 전에 프로필(닉네임/자기소개/사진)을 "탈퇴한 사용자"로 초기화하고 이메일 매핑·아바타 파일도 지우지만, 그 사용자가 작성한 DAY/댓글 문서 자체는 지우지 않습니다(좋아요/댓글 수 등 다른 사람과 얽힌 데이터 정합성이 깨지는 걸 피하려고 의도적으로 남겨둠). 완전한 캐스케이드 삭제가 필요하면 Cloud Functions로 추가할 수 있습니다.
- **2차/3차 개발 항목** (PRD 13장 기준): 친구 마인드맵 UI, 추천 알고리즘, 검색/해시태그, 공동 작성 DAY, 회고 알림(On this day), D-Day 카운트다운, 타임캡슐 DAY, SHOP 결제, 연말 결산 카드, 인생연표 PDF 내보내기, 프리미엄 구독, 기록 히트맵, 음성 메모는 이번 빌드 범위에 포함되어 있지 않습니다.

## 이 문서 작성 이후 고친 것들 (자체 점검)

앱을 만든 뒤 실제 Firebase 프로젝트에 대고 자동화 테스트를 돌리면서 발견한 문제들을 고쳤습니다. 자세한 내용은 대화 요약을 참고하세요 — 요점만 적으면:

- 요일/달력 계산 버그(모든 날짜가 하루 어긋나게 표시되던 문제) 수정
- 웹에서 로그인/삭제/확인 알림창이 아무 반응 없던 문제 수정
- 웹에서 DAY 작성 시 날짜를 못 바꾸던 문제 수정 (달력 위젯 → 오늘/어제 버튼으로 교체)
- 회원가입 시 드물게 닉네임이 이메일 앞부분으로 잘못 저장될 수 있던 경쟁 상태(race condition) 수정
- 그룹 삭제 기능이 아예 없던 것 추가, 친구가 없는 빈 그룹이 목록에서 숨겨지던 문제 수정
- 비공개 DAY를 다른 사람이 좋아요/댓글 카운트를 조작할 수 있던 보안 규칙 허점 수정
- DAY를 못 불러왔을 때 무한 로딩만 뜨던 문제 수정, 여러 화면에서 에러가 조용히 씹혀 원인 파악이 안 되던 문제 수정
- **보안 취약점 일괄 점검 및 수정** (IDOR 등):
  - DAY 수정 API로 작성 시간 제한(date)·사진 목록(photoURLs)을 우회 변경할 수 있던 문제
  - 좋아요/댓글 수를 임의 값으로 덮어쓸 수 있던 문제 → ±1 증감만 허용
  - 프로필의 dayCount를 임의 값으로 덮어쓸 수 있던 문제 → ±1 증감만 허용
  - 모든 유저의 이메일이 로그인한 사람이면 누구나 조회 가능하던 문제 → 필드 자체를 제거
  - 존재하지 않는 dayId로 아무 유저에게나 알림을 만들 수 있던 문제 → 실제 존재하는 DAY만 허용
  - 계정 탈퇴 시 프로필·이메일 매핑·아바타가 그대로 남아있던 문제 → 탈퇴 시 정리하도록 수정
  - **DAY 사진 접근 권한 재설계**: 예전엔 Storage 보안 규칙이 "로그인만 하면 열람 가능" 수준이라 나만보기 사진도 경로를 알면 보였고, 친구공개/특정그룹은 아예 뷰어별 검증이 불가능했다(Storage 규칙이 Firestore를 실시간 대조 못 함). 또한 한번 발급된 공개 다운로드 URL은 보안 규칙과 무관하게 유출되면 영원히 유효했다. `servePhoto` Cloud Function을 만들어서 사진을 공개 URL 없이, 요청마다 Firestore의 공개범위·친구관계·그룹 소속을 서버가 직접 확인한 뒤에만 서빙하도록 바꿔서 두 문제를 모두 해결했다.
