# Firebase 설정 가이드

DAY 앱은 Firebase(Authentication, Firestore, Storage, Cloud Functions, Hosting)를 백엔드로 사용합니다. 처음 한 번만 아래 순서대로 설정하면 됩니다.

## 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 에서 새 프로젝트를 만듭니다.
2. 웹 앱을 하나 등록합니다(⚙️ 프로젝트 설정 → 일반 → 내 앱 → 앱 추가 → 웹).
3. "Firebase SDK 추가" 단계의 **npm 사용** 탭에 나오는 `firebaseConfig` 값을 복사해둡니다.
4. 요금제를 **Blaze(종량제)**로 바꿉니다 — Cloud Functions와 Cloud Scheduler에 필요합니다. 무료 사용량 안에서는 보통 비용이 거의 나오지 않습니다.

## 2. 환경변수 채우기

프로젝트 루트의 `.env.example`을 `.env`로 복사하고 채웁니다(`.env`는 git에 올라가지 않습니다).

```
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...     # 구글 로그인(선택)
EXPO_PUBLIC_KAKAO_REST_API_KEY=...       # 카카오 로그인(선택)
```

카카오 로그인을 쓰면 서버에도 같은 키가 필요합니다: `functions/.env`에 `KAKAO_REST_API_KEY=...` 한 줄을 넣습니다.

`.env`를 채우지 않고 실행하면 앱은 "Firebase 설정이 필요해요" 안내 화면만 보여줍니다.

## 3. 로그인 방법 켜기

Firebase 콘솔 → Authentication → Sign-in method:

- **이메일/비밀번호**: 사용 설정. 가입 후 이메일 인증을 마쳐야 글·댓글·편지를 쓸 수 있습니다(보안 규칙에서 확인).
- **Google**: 사용 설정 후, Google Cloud Console의 "OAuth 2.0 클라이언트 ID(웹 애플리케이션)"를 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`에 넣습니다.
- **Kakao**: Firebase 기본 제공자가 아니라서 Cloud Function(`exchangeKakaoCode`)이 커스텀 토큰을 만들어 줍니다. Kakao Developers에서 앱을 만들고 REST API 키를 위 두 `.env`에 넣은 뒤, 카카오 로그인 Redirect URI에 앱 주소(웹은 `https://<도메인>`)를 등록합니다. 카카오 콘솔에서 **Client Secret**을 켜고 서버에서만 쓰도록 바꾸면 더 안전합니다(지금 코드는 Client Secret 없이 동작).

## 4. Firestore · Storage 만들기

- **Firestore**(Standard) 데이터베이스를 만듭니다. 위치는 `asia-northeast3(서울)` 권장.
- **Storage**를 시작합니다.

보안 규칙(`firestore.rules`, `storage.rules`)과 인덱스(`firestore.indexes.json`)는 이 저장소에 이미 있습니다.

## 5. 배포

```bash
npm install -g firebase-tools
firebase login
firebase use --add                     # 프로젝트 선택

# 규칙·인덱스·함수 (함수는 functions/ 폴더)
firebase deploy --only firestore:rules,firestore:indexes,storage,functions

# 웹 앱
npx expo export --platform web         # dist/ 생성
firebase deploy --only hosting
```

새 인덱스는 만들어지는 데 몇 분 걸릴 수 있습니다. 그동안 해당 화면(대화창 등)에서 "index is building" 오류가 잠깐 날 수 있어요.

규칙과 함수는 **같이** 배포해야 합니다 — 좋아요/댓글/작성 수는 이제 서버(함수)만 세고 클라이언트는 못 바꾸게 규칙이 막고 있어서, 한쪽만 올라가면 숫자가 안 바뀌거나 동작이 어긋납니다.

## 로컬 에뮬레이터

운영 데이터를 건드리지 않고 규칙·함수를 같이 돌려볼 수 있습니다(Java 21 필요). 프로젝트 ID를 `demo-`로 시작하게 주면 실제 Firebase에 절대 접속하지 않습니다.

```bash
firebase emulators:start --only auth,firestore,functions --project demo-day-app

# 다른 터미널에서, 앱을 에뮬레이터에 붙여 실행
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1 EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-day-app npx expo start --web
```

에뮬레이터에선 1분마다 도는 스케줄 함수(`expireOverdueLetters`)가 자동 실행되지 않습니다. `functions/letters-core.js`의 `sweepLetters()`를 직접 불러서 확인하세요.

---

## 펫 편지

### 흐름

1. **펫 데려오기** — 첫 펫의 종은 직접 고릅니다(14종: 강아지, 고양이, 새, 말, 소, 돼지, 쥐, 호랑이, 토끼, 용, 뱀, 양, 원숭이, 닭). 성격(서두르는/여유로운/꼼꼼한/장난꾸러기/수줍은/듬직한)은 데려올 때 무작위. DAY를 7개 쓰면 두 번째 펫(최대 2마리).
2. **보내기** — 대화창에서 펫을 고르고 답장 대기시간(5분/15분/30분/1시간/3시간/6시간/12시간/24시간)을 정해 보냅니다. 상대 대화창에 바로 도착하고, 대기시간은 도착 시점부터 셉니다.
3. **답장** — 상대는 자기 펫 없이, 와 있는 펫에 답장을 실어 보냅니다. 답장하면 펫이 즉시 돌아옵니다.
4. **복귀** — 답장이 없으면 시간이 끝날 때 자동 복귀(최대 1분 지연). 서두르는 펫은 10% 확률로 50~80% 시점에 먼저 돌아오고, 여유로운 펫은 10% 확률로 시간이 끝나도 계속 머뭅니다(답장을 받거나 주인이 부를 때까지).
5. **일로 와** — 주인은 언제든 펫을 불러들일 수 있습니다. 메시지는 대화창에 남고 대기 표시만 사라집니다.
6. **펫 보내줘** — 펫이 이미 돌아갔으면 상대에게 호출을 보낼 수 있습니다(같은 상대에게 24시간에 한 번). 받은 사람이 수락하면서 펫·대기시간을 고르면, 그 펫이 메시지 없이 가서 호출한 사람의 메시지를 기다립니다.
7. **손상** — 보내는 메시지와 돌아오는 답장이 각각 따로 추첨됩니다. 메시지를 글자 기준으로 6칸(앞 절반 3칸 + 뒤 절반 3칸)으로 나눠 손상 칸 수(1칸 65% … 6칸 1%)와 위치를 정하고, 그 칸의 글자를 'ㅁ'으로 가린 뒤 펫 종의 흔적(침 번짐, 발톱 자국, 그을림 …)을 입힙니다. 결과는 서버에 저장돼 다시 열거나 다른 기기에서 봐도 같습니다. 빈 칸(짧은 메시지)이나 공백만 있는 칸은 추첨에서 뺍니다.
8. **뭐라고 했어?** — 손상된 메시지를 받은 사람은 메시지당 한 번 보낸 사람에게 다시 물어볼 수 있습니다(알림만 감, 원문 자동 공개·자동 재전송 없음).
9. **친밀도** — 펫마다 0~100. 배달 후 복귀 +1(하루 3번), 주인의 쓰다듬기·간식 +1(각각 하루 1번), 하루 최대 +5. 최종 손상 확률 = 성격 기본값 − 친밀도 × 0.04%p(최소 1%). 상대방의 쓰다듬기·간식은 반응과 기록에만 남습니다.

### 확률·수치 바꾸기 (재배포 없이)

Firestore에 `config/petRules` 문서를 만들면 `functions/pet-config.js`의 기본값 위에 덮어씁니다(최대 1분 캐시). 넣은 필드만 바뀌고, 타입이 틀린 값은 무시합니다.

```json
{
  "personalities": {
    "hasty": { "baseDamagePercent": 6, "earlyReturnChancePercent": 10, "earlyReturnMinRatio": 0.5, "earlyReturnMaxRatio": 0.8 },
    "easygoing": { "baseDamagePercent": 5, "overstayChancePercent": 10 },
    "careful": { "baseDamagePercent": 3 },
    "playful": { "baseDamagePercent": 8 },
    "timid": { "baseDamagePercent": 5 },
    "reliable": { "baseDamagePercent": 4 }
  },
  "intimacyDamageReductionPerPoint": 0.04,
  "minDamagePercent": 1,
  "damageCellWeights": [65, 20, 8, 4, 2, 1],
  "intimacy": { "max": 100, "deliveryGain": 1, "deliveryGainDailyMax": 3, "petGain": 1, "snackGain": 1, "dailyMax": 5 }
}
```

꼼꼼한·장난꾸러기·수줍은·듬직한의 기본 손상 확률은 기획서에 수치가 없어서 개발 쪽 임시값입니다.

### 아직 정해지지 않아서 구현하지 않은 것

- 3번째 이후 펫 획득(뽑기)과 최대 보유 수 — 지금은 첫 펫 + 미션 1마리
- 간식의 획득·소모(재화) — 지금은 하루 1번 무료
- 서두르는/여유로운 외 성격의 예외 행동
- 펫 일러스트 — 지금은 종별 이모지 + 파스텔 배경(그림이 생기면 `src/components/pet-avatar.tsx`만 바꾸면 됨)

---

## 보안 메모 (자체 점검 이력)

- 좋아요/댓글/작성 수는 서버 트리거가 실제 문서 수를 다시 세서 쓴다. 클라이언트의 ±1 쓰기는 규칙에서 막는다(예전엔 +1 요청만 반복해 숫자를 부풀릴 수 있었다).
- 펫 문서는 `petCount` +1과 같은 배치로만 만들 수 있다(예전엔 펫을 무한정 만들어 도배 방지 장치를 무력화할 수 있었다). 두 번째 펫은 서버가 센 `dayCount ≥ 7`일 때만.
- 푸시 토큰은 본인만 읽는 `users/{uid}/private/push`로 옮겼다(예전엔 누구나 읽는 프로필 문서에 있어 가짜 푸시를 보낼 수 있었다).
- 좋아요/태그 알림은 (DAY, 보낸 사람)마다 한 번만 만들 수 있고, 태그 알림은 친구에게만 갈 수 있다.
- 편지의 보낸/받는 사람 이름·사진은 실제 프로필과 같아야 한다. 대기시간은 정해진 목록만, 빈 편지는 실제 호출에 응답할 때만.
- 펫 회수·쓰다듬기·재문의·친밀도·손상 추첨은 전부 서버(`petAction`, 트리거)에서만 한다. 문서 경로에 들어가는 id는 형식을 먼저 검사한다.
- 프로필 사진 주소는 https만 받는다.
- DAY 사진은 공개 URL 없이 `servePhoto` 함수가 요청마다 공개범위·친구관계를 확인한 뒤에만 서빙한다.
- 사용하지 않는 안드로이드 권한(마이크·동영상·오디오·카메라)은 빼고 막아뒀다.
