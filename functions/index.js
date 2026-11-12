const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
// FieldValue는 모듈 경로(firebase-admin/firestore)에서 가져온다 — 예전처럼
// admin 네임스페이스로 접근하면 에뮬레이터 런타임에선 undefined라서, 로컬
// 에뮬레이터로 함수를 테스트할 수가 없었다.
const { FieldValue } = require('firebase-admin/firestore');

admin.initializeApp({ storageBucket: 'day-app-6e618.firebasestorage.app' });

const db = admin.firestore();
const bucket = admin.storage().bucket();

const { createRulesLoader } = require('./pet-config');
const { ActionError, createLettersCore } = require('./letters-core');
const { withJosa } = require('./pet-logic');

const getPetRules = createRulesLoader(db);
const lettersCore = createLettersCore({ db, getRules: getPetRules });

/**
 * 아주 단순한 인메모리 슬라이딩 윈도우 rate limiter.
 *
 * Firestore/Redis 같은 곳에 카운터를 두는 "제대로 된" 분산 rate limit이 아니라,
 * 함수 인스턴스 하나가 살아있는 동안만 유효한 근사치다(콜드 스타트로 인스턴스가
 * 새로 뜨면 카운트가 리셋되고, 인스턴스가 여러 개 떠 있으면 각자 따로 센다).
 * 그래도 "로그인한 계정 하나로 이 함수를 무한정 두드려서 비용을 늘리거나 이메일
 * 목록을 훑는" 흔한 남용 패턴은 이 정도로도 충분히 막는다 — 지금 이 앱 규모에
 * Redis 같은 별도 인프라를 두는 건 과한 투자라고 판단했다.
 */
function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> timestamps[]
  return function checkAndRecord(key) {
    const now = Date.now();
    const timestamps = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= max) {
      hits.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    hits.set(key, timestamps);
    // 메모리가 무한정 늘어나지 않도록 가끔 청소한다.
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }
    return true;
  };
}

const photoRateLimit = createRateLimiter({ windowMs: 60_000, max: 120 }); // 분당 120장
const emailLookupRateLimit = createRateLimiter({ windowMs: 60_000, max: 10 }); // 분당 10회
// 로그인 전(=아직 uid가 없는) 요청이라 IP 기준으로 제한한다.
const kakaoAuthRateLimit = createRateLimiter({ windowMs: 60_000, max: 10 }); // 분당 10회
// 펫 행동(회수/쓰다듬기/간식/재문의). 정상 사용은 분당 몇 번이면 충분하다 —
// 특히 "일로 와"로 회수했다가 바로 다시 보내는 도배를 이걸로 누른다.
const petActionRateLimit = createRateLimiter({ windowMs: 60_000, max: 30 }); // 분당 30회

async function verifyBearer(req) {
  const authHeader = req.get('Authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * DAY 첨부 사진을 인증된 요청자에게만 서빙하는 프록시.
 *
 * 예전엔 Firebase Storage의 공개 다운로드 URL(`?alt=media&token=...`)을 클라이언트에
 * 직접 내려줬는데, 그 방식은 두 가지 문제가 있었다:
 *   1) Storage 보안 규칙은 "지금 요청하는 사람이 이 DAY를 볼 권한이 있는지"를
 *      실시간으로(친구 관계, 그룹 소속까지) 판단하지 못한다 — 규칙 언어가 그런
 *      cross-document 동적 조회를 지원하지 않는다(실제로 시도해보고 확인함).
 *   2) 다운로드 URL은 한번 발급되면 보안 규칙과 완전히 무관하게, 그 토큰을 아는
 *      사람은 영원히 접근 가능하다 — 공개범위를 나중에 잠가도 이미 나간 링크는
 *      안 죽는다.
 *
 * 이 함수는 두 문제를 한번에 없앤다: 클라이언트는 이제 공개 URL을 아예 받지
 * 않고, 사진을 보고 싶을 때마다 이 함수를 (자기 로그인 토큰을 실어서) 호출한다.
 * 함수는 매 요청마다 Firestore의 "지금" 상태(공개범위/친구관계/그룹)를 관리자
 * 권한으로 직접 확인한 뒤에만 사진 바이트를 스트리밍해서 돌려준다.
 */
exports.servePhoto = onRequest({ region: 'asia-northeast3', cors: true }, async (req, res) => {
  try {
    const requesterUid = await verifyBearer(req);
    if (!requesterUid) {
      res.status(401).send('Unauthorized');
      return;
    }

    if (!photoRateLimit(requesterUid)) {
      res.status(429).send('Too many requests');
      return;
    }

    const rawParam = req.query.path;
    if (!rawParam || typeof rawParam !== 'string') {
      res.status(400).send('Missing path');
      return;
    }
    const storagePath = resolveStoragePath(rawParam);
    if (!storagePath) {
      res.status(400).send('Invalid path');
      return;
    }

    const parts = storagePath.split('/');
    // days/{uid}/{dayId}/{fileName} (신규) 또는 days/{uid}/{fileName} (구 평면 구조)
    if (parts[0] !== 'days' || parts.length < 3 || parts.length > 4) {
      res.status(400).send('Invalid path');
      return;
    }
    const authorUid = parts[1];
    const dayId = parts.length === 4 ? parts[2] : null;

    const authorized = await isAuthorized({ requesterUid, authorUid, dayId });
    if (!authorized) {
      res.status(403).send('Forbidden');
      return;
    }

    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).send('Not found');
      return;
    }
    const [metadata] = await file.getMetadata();
    res.set('Content-Type', metadata.contentType || 'image/jpeg');
    // 완전히 캐시를 막으면(no-store) 피드를 스크롤할 때마다 같은 사진에도 매번
    // 인증+Firestore 조회가 다시 일어나 비용·지연이 커진다. 그렇다고 오래
    // 캐시하면 공개범위를 잠근 뒤에도 한동안 예전처럼 보일 수 있다. 이 둘을
    // 절충해 "이 브라우저/기기에서만, 60초만" 캐시한다 — 딱 그 창 만큼만
    // 공개범위 변경 반영이 늦어질 수 있다는 뜻.
    res.set('Cache-Control', 'private, max-age=60');
    file.createReadStream().on('error', () => res.status(500).end()).pipe(res);
  } catch (err) {
    console.error('servePhoto error', err);
    res.status(500).send('Internal error');
  }
});

/**
 * 이메일로 가입 여부·uid를 조회한다 ("친구 추가" 기능이 씀).
 *
 * 예전엔 클라이언트가 usersByEmail/{emailKey} 문서를 Firestore 규칙으로
 * 직접 읽었는데, 그 규칙이 "로그인만 하면 전체 매핑을 다 읽을 수 있음"이라
 * 임의의 이메일을 하나씩 넣어보며 "이 이메일로 가입했는지" 무제한으로 훑어볼
 * 수 있었다(계정 열거). 지금은 그 컬렉션의 클라이언트 직접 읽기를 완전히
 * 막고(firestore.rules), 이 함수로만 조회하게 하면서 분당 10회로 제한한다.
 */
exports.findUidByEmail = onRequest({ region: 'asia-northeast3', cors: true }, async (req, res) => {
  try {
    const requesterUid = await verifyBearer(req);
    if (!requesterUid) {
      res.status(401).send('Unauthorized');
      return;
    }

    if (!emailLookupRateLimit(requesterUid)) {
      res.status(429).json({ error: 'too-many-requests' });
      return;
    }

    const email = req.query.email;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'missing-email' });
      return;
    }

    const emailKey = email.trim().toLowerCase();
    const snap = await db.doc(`usersByEmail/${emailKey}`).get();
    if (!snap.exists) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    res.status(200).json({ uid: snap.data().uid });
  } catch (err) {
    console.error('findUidByEmail error', err);
    res.status(500).json({ error: 'internal' });
  }
});

/** days/{uid}/{dayId}/{fileName} 형태와, 구버전에서 저장해둔 전체 다운로드
 * URL(`https://firebasestorage.googleapis.com/v0/b/.../o/days%2F...?alt=media&token=...`)
 * 형태를 둘 다 받아서 실제 Storage 객체 경로로 정규화한다. */
function resolveStoragePath(raw) {
  if (raw.startsWith('days/')) return raw;
  const m = raw.match(/\/o\/([^?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

async function isAuthorized({ requesterUid, authorUid, dayId }) {
  if (requesterUid === authorUid) return true;

  if (!dayId) {
    // 구버전 평면 경로는 dayId가 없어 공개범위를 확인할 방법이 없다 —
    // 예전 Storage 규칙과 동일하게 "로그인한 사용자면 열람 가능"으로 취급한다.
    return true;
  }

  const daySnap = await db.doc(`days/${dayId}`).get();
  if (!daySnap.exists) return false;
  const day = daySnap.data();
  if (day.deleted !== false) return false;
  // firestore.rules의 canReadDayData와 동일하게, 아직 확정 안 된 예정(draft)
  // DAY는 작성자만 볼 수 있다(위에서 이미 걸러짐) — 이 함수는 Admin SDK로
  // 보안 규칙을 우회해서 도는 만큼, 여기서 직접 다시 확인해야 한다.
  if (day.status !== 'confirmed') return false;
  if (day.visibility === 'public') return true;
  if (day.visibility !== 'friends' && day.visibility !== 'group') return false;

  const friendSnap = await db.doc(`users/${authorUid}/friends/${requesterUid}`).get();
  if (!friendSnap.exists) return false;
  if (day.visibility === 'friends') return true;
  return friendSnap.data().groupId === day.groupId;
}

// 알림 종류를 사용자가 알림 설정 화면에서 끄고 켜는 6개 카테고리로 묶는다.
// friend_request/friend_accept는 둘 다 "친구 알림", 펫 편지 관련은 전부
// "편지 알림" 하나로 취급한다.
const NOTIFICATION_CATEGORY = {
  tag: 'tag',
  comment: 'comment',
  like: 'like',
  friend_request: 'friend',
  friend_accept: 'friend',
  memory: 'memory',
  letter_received: 'letter',
  letter_replied: 'letter',
  letter_expired: 'letter',
  pet_summon: 'letter',
  summon_accepted: 'letter',
  pet_early_return: 'letter',
  pet_overstay: 'letter',
  letter_reask: 'letter',
};

// 클라이언트 src/i18n/translations.ts의 notifications.* 키와 같은 문구다.
// Cloud Functions는 클라이언트 번들과 별도로 배포되는 독립 코드라 그
// 파일을 그대로 가져다 쓸 수 없어서, 푸시 문구만 따로 복사해둔다 — 문구를
// 바꾸면 양쪽 다 맞춰줘야 한다.
// 따옴표로 감싼 제목 뒤 조사만('생일 파티'를 / '첫 출근 날'을).
const objectJosa = (word) => withJosa(String(word || ''), '을/를').slice(String(word || '').length);

const PUSH_MESSAGES = {
  ko: {
    tag: (n) => `${n.fromNickname}님이 '${n.dayTitle}'에 회원님을 태그했어요`,
    comment: (n) => `${n.fromNickname}님이 '${n.dayTitle}'에 댓글을 남겼어요`,
    like: (n) => `${n.fromNickname}님이 '${n.dayTitle}'${objectJosa(n.dayTitle)} 좋아해요`,
    friend_request: (n) => `${n.fromNickname}님이 친구 요청을 보냈어요`,
    friend_accept: (n) => `${n.fromNickname}님이 친구 요청을 수락했어요`,
    memory: (n) => `${n.yearsAgo}년 전 오늘, '${n.dayTitle}'${objectJosa(n.dayTitle)} 기록했어요`,
    letter_received: (n) =>
      n.petName
        ? `${n.fromNickname}님의 ${withJosa(n.petName, '이/가')} 편지를 물고 왔어요`
        : `${n.fromNickname}님의 펫이 편지를 물고 왔어요`,
    letter_replied: (n) => `${n.fromNickname}님이 답장을 보냈어요`,
    letter_expired: (n) =>
      n.petName
        ? `${withJosa(n.petName, '이/가')} ${n.fromNickname}님의 답장을 못 받고 돌아왔어요`
        : `${n.fromNickname}님에게 보낸 편지가 답장 없이 돌아왔어요`,
    pet_summon: (n) => `${n.fromNickname}님이 펫을 보내달라고 해요`,
    summon_accepted: (n) => `${n.fromNickname}님이 ${withJosa(n.petName || '펫', '을/를')} 보내줬어요. 답장을 실어 보내세요`,
    pet_early_return: (n) => `${withJosa(n.petName || '펫', '이/가')} 기다리다 먼저 돌아왔어요`,
    pet_overstay: (n) => `${withJosa(n.petName || '펫', '이/가')} ${n.fromNickname}님 곁에 계속 머물고 있어요`,
    letter_reask: (n) => `${n.fromNickname}님이 "뭐라고 했어?" 하고 물어봐요`,
    default: () => '새 알림이 있어요',
  },
  en: {
    tag: (n) => `${n.fromNickname} tagged you in '${n.dayTitle}'`,
    comment: (n) => `${n.fromNickname} commented on '${n.dayTitle}'`,
    like: (n) => `${n.fromNickname} liked '${n.dayTitle}'`,
    friend_request: (n) => `${n.fromNickname} sent you a friend request`,
    friend_accept: (n) => `${n.fromNickname} accepted your friend request`,
    memory: (n) => `${n.yearsAgo} year(s) ago today, you recorded '${n.dayTitle}'`,
    letter_received: (n) => `${n.fromNickname}'s ${n.petName || 'pet'} brought you a letter`,
    letter_replied: (n) => `${n.fromNickname} replied to your letter`,
    letter_expired: (n) =>
      n.petName
        ? `${n.petName} came back without a reply from ${n.fromNickname}`
        : `Your letter to ${n.fromNickname} came back unanswered`,
    pet_summon: (n) => `${n.fromNickname} is asking you to send your pet`,
    summon_accepted: (n) => `${n.fromNickname} sent ${n.petName || 'a pet'} over. Send your message with it`,
    pet_early_return: (n) => `${n.petName || 'Your pet'} got tired of waiting and came back early`,
    pet_overstay: (n) => `${n.petName || 'Your pet'} is still staying with ${n.fromNickname}`,
    letter_reask: (n) => `${n.fromNickname} asked, "What did you say?"`,
    default: () => 'You have a new notification',
  },
};

/** userLocale은 users/{uid} 문서의 locale 필드(클라이언트가 언어를 바꿀 때마다
 * 기록해둔 실제 언어) — 없으면(예: 이 기능 이전 가입자) 한국어로 취급한다. */
function pushMessageFor(notification, userLocale) {
  const messages = PUSH_MESSAGES[userLocale] || PUSH_MESSAGES.ko;
  const build = messages[notification.type] || messages.default;
  return build(notification);
}

/**
 * users/{uid}/notifications/{notificationId} 문서가 새로 생기면, 그 알림
 * 주인(uid)에게 실제 기기 푸시를 보낸다. 인앱 알림함은 항상 기록되고, 이
 * 함수는 그중 "이 사람이 이 종류의 알림을 푸시로도 받기로 했는지"만 추가로
 * 판단한다.
 *
 * 푸시 토큰은 users/{uid}/private/push 문서에 있다(본인만 읽을 수 있음).
 * 예전엔 누구나 읽을 수 있는 users/{uid} 문서의 pushTokens 필드에 있어서,
 * 로그인한 아무나 다른 사람 토큰을 가져가 Expo 푸시 API로 가짜 알림을 보낼 수
 * 있었다 — 옮기기 전 토큰도 계속 받도록 예전 필드도 같이 읽는다.
 */
exports.sendPushOnNotification = onDocumentCreated(
  { document: 'users/{uid}/notifications/{notificationId}', region: 'asia-northeast3' },
  async (event) => {
    const notification = event.data?.data();
    if (!notification) return;

    const uid = event.params.uid;
    const category = NOTIFICATION_CATEGORY[notification.type];
    if (!category) return;

    const userRef = db.doc(`users/${uid}`);
    const pushRef = db.doc(`users/${uid}/private/push`);
    const [userSnap, pushSnap] = await Promise.all([userRef.get(), pushRef.get()]);
    if (!userSnap.exists) return;
    const userData = userSnap.data();

    const settings = userData.notificationSettings || {};
    // 설정에 값이 없는 카테고리는 기본 켜짐(true)으로 취급한다 — 이 필드가
    // 생기기 전에 가입한 계정도 계속 알림을 받아야 하기 때문이다.
    if (settings[category] === false) return;

    const privateTokens = pushSnap.exists && Array.isArray(pushSnap.data().tokens) ? pushSnap.data().tokens : [];
    const legacyTokens = Array.isArray(userData.pushTokens) ? userData.pushTokens : [];
    const tokens = Array.from(new Set([...privateTokens, ...legacyTokens]));
    if (tokens.length === 0) return;

    const body = pushMessageFor(notification, userData.locale);
    const messages = tokens.map((token) => ({
      to: token,
      title: 'DAY',
      body,
      data: {
        type: notification.type,
        dayId: notification.dayId || null,
        letterId: notification.letterId || null,
        fromUid: notification.fromUid || null,
      },
    }));

    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const result = await res.json();
      const tickets = Array.isArray(result.data) ? result.data : [];

      // Expo가 "이 토큰은 더 이상 유효하지 않다"고 바로 알려주는 경우
      // (기기 앱 삭제 등)에 한해 그 토큰을 정리한다. 그 외 실패(일시적
      // 네트워크 문제 등)는 다음 알림 때 다시 시도되게 그냥 둔다.
      const deadTokens = tickets
        .map((ticket, i) => (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? tokens[i] : null))
        .filter(Boolean);
      if (deadTokens.length > 0) {
        const remove = FieldValue.arrayRemove(...deadTokens);
        await Promise.all([
          pushSnap.exists ? pushRef.update({ tokens: remove }) : null,
          legacyTokens.length > 0 ? userRef.update({ pushTokens: remove }) : null,
        ]);
      }
    } catch (err) {
      console.error('sendPushOnNotification error', err);
    }
  }
);

/**
 * 매일 KST 자정 직후 한 번 돌면서, 정확히 N년 전 오늘 작성된 확정 DAY를
 * 찾아 그 작성자에게 "회고 알림"(On this day)을 남긴다. 실제 푸시 발송은
 * 이 함수가 직접 하지 않는다 — users/{uid}/notifications에 문서를 만들면
 * 위 sendPushOnNotification 트리거가 알아서 사용자 알림 설정을 확인하고
 * 푸시를 보낸다(기존 알림 인프라 그대로 재사용).
 *
 * dateLabel이 'YYYY-MM-DD'로 저장돼 있어서, "오늘과 월일이 같은 과거 N년
 * 전"의 dateLabel들을 미리 계산해 where(...,'in',[...])로 한 번에
 * 조회한다 — 이 쿼리엔 firestore.indexes.json에 별도 복합 색인이
 * 필요하다(dateLabel/status/deleted).
 */
exports.sendMemoryNotifications = onSchedule(
  { schedule: '5 0 * * *', timeZone: 'Asia/Seoul', region: 'asia-northeast3' },
  async () => {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const year = kstNow.getUTCFullYear();
    const mm = String(kstNow.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(kstNow.getUTCDate()).padStart(2, '0');

    const YEARS_BACK = 10;
    const labelToYearsAgo = new Map();
    for (let yearsAgo = 1; yearsAgo <= YEARS_BACK; yearsAgo++) {
      labelToYearsAgo.set(`${year - yearsAgo}-${mm}-${dd}`, yearsAgo);
    }

    const snap = await db
      .collection('days')
      .where('dateLabel', 'in', Array.from(labelToYearsAgo.keys()))
      .where('status', '==', 'confirmed')
      .where('deleted', '==', false)
      .get();

    if (snap.empty) return;

    for (const docSnap of snap.docs) {
      const day = docSnap.data();
      // inHistory를 false로 꺼둔 DAY는 본인이 "연혁에서 빼기"로 선택한
      // 기록이라, 회고로 다시 들춰내지 않는다.
      if (day.inHistory === false) continue;
      const yearsAgo = labelToYearsAgo.get(day.dateLabel);
      if (!yearsAgo) continue;

      try {
        await db.collection(`users/${day.authorId}/notifications`).add({
          type: 'memory',
          fromUid: day.authorId,
          fromNickname: day.authorNickname,
          dayId: docSnap.id,
          dayTitle: day.title,
          yearsAgo,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.error('sendMemoryNotifications: failed for', docSnap.id, err);
      }
    }
  }
);

// ---------------------------------------------------------------------------
// 펫 편지. 실제 로직은 letters-core.js에 있고(에뮬레이터에서 직접 불러
// 테스트할 수 있게 분리), 여기서는 트리거/스케줄/HTTP에 연결만 한다.
// ---------------------------------------------------------------------------

/** 편지가 생기면 도착 손상·복귀 시각·성격 예외 행동을 정하고 받는 사람에게
 * 알린다(letters-core.js의 handleLetterCreated). */
exports.onLetterCreated = onDocumentCreated(
  { document: 'letters/{letterId}', region: 'asia-northeast3' },
  async (event) => {
    await lettersCore.handleLetterCreated(event.params.letterId);
  }
);

/** 답장이 도착하면 돌아오는 길의 손상을 굴리고, 펫을 집으로 돌려보낸다. */
exports.onLetterReplyCreated = onDocumentCreated(
  { document: 'letters/{letterId}/reply/{replyId}', region: 'asia-northeast3' },
  async (event) => {
    await lettersCore.handleReplyCreated(event.params.letterId, event.params.replyId);
  }
);

/**
 * 1분마다 복귀 시각이 지난 펫을 돌려보내고, 계속 머무는 펫을 주인에게 알린다.
 * 대기시간이 5분짜리도 있어서(예전 최소 1시간) 예전처럼 15분마다 돌면 체감
 * 지연이 너무 컸다. 정확한 남은 시간은 화면이 시각으로 직접 계산해 보여주고,
 * 이 함수는 상태 정리만 한다(최대 1분 늦을 수 있음).
 */
exports.expireOverdueLetters = onSchedule(
  { schedule: 'every 1 minutes', timeZone: 'Asia/Seoul', region: 'asia-northeast3' },
  async () => {
    await lettersCore.sweepLetters();
  }
);

const SAFE_ID = /^[A-Za-z0-9_:-]{1,128}$/;

function requireId(value) {
  const id = typeof value === 'string' ? value : '';
  if (!SAFE_ID.test(id)) throw new ActionError(400, 'bad-id');
  return id;
}

/**
 * 펫에게 하는 행동들(회수, 쓰다듬기/간식, "뭐라고 했어?"). 친밀도·배달
 * 기록·펫 상태처럼 클라이언트가 직접 바꾸면 안 되는 값을 건드려서 서버에서
 * 검증하고 처리한다.
 *   POST { action: 'recall', petId }
 *   POST { action: 'interact', ownerUid, petId, kind: 'pet' | 'snack' }
 *   POST { action: 'reask', letterId, part: 'outbound' | 'reply' }
 * id는 문서 경로에 그대로 들어가서, '/'가 섞인 값으로 다른 문서를 가리키지
 * 못하게 형식을 먼저 검사한다.
 */
exports.petAction = onRequest({ region: 'asia-northeast3', cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method-not-allowed' });
      return;
    }
    const uid = await verifyBearer(req);
    if (!uid) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!petActionRateLimit(uid)) {
      res.status(429).json({ error: 'too-many-requests' });
      return;
    }

    const body = req.body || {};
    let result;
    switch (body.action) {
      case 'recall':
        result = await lettersCore.recallPet(uid, requireId(body.petId));
        break;
      case 'interact':
        result = await lettersCore.interactWithPet(uid, requireId(body.ownerUid), requireId(body.petId), body.kind);
        break;
      case 'reask':
        result = await lettersCore.reaskLetter(uid, requireId(body.letterId), body.part);
        break;
      default:
        res.status(400).json({ error: 'bad-action' });
        return;
    }
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ActionError) {
      res.status(err.status).json({ error: err.code });
      return;
    }
    console.error('petAction error', err);
    res.status(500).json({ error: 'internal' });
  }
});

// ---------------------------------------------------------------------------
// 집계 값(좋아요 수, 댓글 수, 작성한 DAY 수)은 서버만 센다.
//
// 예전엔 클라이언트가 직접 ±1 했고 보안 규칙은 "한 번에 ±1인지"만 봤다 —
// 그래서 실제 좋아요/댓글 문서 없이 +1 요청만 반복해서 숫자를 마음대로
// 부풀릴 수 있었다(dayCount도 같아서 "DAY 7개 쓰면 두 번째 펫" 미션을 글
// 없이 채울 수 있었다). 지금은 클라이언트가 이 필드를 아예 못 바꾸고, 문서가
// 생기거나 지워질 때마다 서버가 실제 개수를 다시 세어 덮어쓴다. "다시 세기"라
// 트리거가 두 번 와도 숫자가 틀어지지 않는다.
// ---------------------------------------------------------------------------

async function recountInto(targetRef, field, query) {
  const snap = await query.count().get();
  await targetRef.update({ [field]: snap.data().count }).catch((err) => {
    // 대상 문서가 이미 없으면(예: 탈퇴 정리 중) 조용히 넘어간다.
    if (err.code !== 5) console.error(`${field} 재집계 실패`, targetRef.path, err);
  });
}

exports.onLikeWritten = onDocumentWritten(
  { document: 'days/{dayId}/likes/{likeUid}', region: 'asia-northeast3' },
  async (event) => {
    const dayRef = db.doc(`days/${event.params.dayId}`);
    await recountInto(dayRef, 'likeCount', dayRef.collection('likes'));
  }
);

exports.onCommentWritten = onDocumentWritten(
  { document: 'days/{dayId}/comments/{commentId}', region: 'asia-northeast3' },
  async (event) => {
    const dayRef = db.doc(`days/${event.params.dayId}`);
    await recountInto(dayRef, 'commentCount', dayRef.collection('comments'));

    // 댓글이 지워지면(본인 삭제든, DAY 작성자가 정리했든) 그 사람의 "내가 쓴
    // 댓글" 사본도 같이 지운다. DAY 작성자는 남의 users/{uid}/myComments를
    // 직접 못 지우니(본인 것만 쓰기 가능) 서버가 대신 정리한다.
    const before = event.data?.before;
    const after = event.data?.after;
    if (before && before.exists && !(after && after.exists)) {
      const authorId = before.data().authorId;
      if (authorId) {
        await db
          .doc(`users/${authorId}/myComments/${event.params.commentId}`)
          .delete()
          .catch((err) => console.error('myComments 정리 실패', err));
      }
    }
  }
);

function countsAsDay(snap) {
  if (!snap || !snap.exists) return false;
  const day = snap.data();
  return day.status === 'confirmed' && day.deleted === false;
}

/** 확정됐고 삭제 안 된 DAY 수(dayCount). 좋아요 수 갱신처럼 집계와 상관없는
 * 수정에도 이 트리거가 깨어나서, "집계 대상 여부"가 바뀐 경우에만 다시 센다. */
exports.onDayWritten = onDocumentWritten(
  { document: 'days/{dayId}', region: 'asia-northeast3' },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (countsAsDay(before) === countsAsDay(after)) return;
    const authorId = (after && after.exists ? after.data() : before.data()).authorId;
    if (!authorId) return;
    await recountInto(
      db.doc(`users/${authorId}`),
      'dayCount',
      db.collection('days').where('authorId', '==', authorId).where('status', '==', 'confirmed').where('deleted', '==', false)
    );
  }
);

/**
 * 카카오 로그인. Firebase Authentication엔 카카오가 기본 제공자로 없어서
 * (구글/애플 등과 달리), 직접 커스텀 토큰을 발급해 붙인다.
 *
 * 클라이언트는 카카오 인가 코드(authorization code)만 들고 온다 — 그 다음
 * "코드를 액세스 토큰으로 바꾸기"와 "그 토큰으로 카카오 사용자 정보 가져오기"는
 * 여기서 서버가 대신 한다(카카오 토큰 엔드포인트가 브라우저 직접 호출을 위한
 * CORS를 안 열어줘서이기도 하고, 나중에 카카오 client secret을 쓰게 되더라도
 * 클라이언트에 노출 안 시킬 수 있다).
 *
 * uid는 `kakao:<카카오 사용자 ID>`로 고정해서 매번 같은 Firebase 계정으로
 * 로그인되게 한다. email_verified를 커스텀 클레임으로 심어서, 이메일 동의를
 * 안 한 카카오 계정도(실제로 한국에서 흔하다) DAY 작성 등에 필요한
 * isVerified() 규칙을 통과하게 한다 — 카카오 로그인 자체가 이미 본인 확인을
 * 거친 것으로 취급한다.
 */
exports.exchangeKakaoCode = onRequest({ region: 'asia-northeast3', cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    if (!kakaoAuthRateLimit(req.ip)) {
      res.status(429).json({ error: 'too-many-requests' });
      return;
    }

    const restApiKey = process.env.KAKAO_REST_API_KEY;
    if (!restApiKey) {
      console.error('KAKAO_REST_API_KEY가 설정되지 않았어요 (functions/.env)');
      res.status(500).json({ error: 'not-configured' });
      return;
    }

    const { code, redirectUri } = req.body || {};
    if (!code || !redirectUri || typeof code !== 'string' || typeof redirectUri !== 'string') {
      res.status(400).json({ error: 'missing-params' });
      return;
    }

    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: restApiKey,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });
    if (!tokenRes.ok) {
      // 카카오가 돌려준 원문 에러는 서버 로그에만 남긴다 — 설정 디버깅용으로
      // 잠깐 응답에 그대로 실어 보냈었는데, 로그인 안 된 아무나 호출할 수
      // 있는 엔드포인트라 내부 설정 정보를 그대로 노출하면 안 된다.
      console.error('kakao token exchange failed', tokenRes.status, await tokenRes.text());
      res.status(401).json({ error: 'kakao-token-exchange-failed' });
      return;
    }
    const tokenData = await tokenRes.json();

    const kakaoUserRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!kakaoUserRes.ok) {
      console.error('kakao user fetch failed', kakaoUserRes.status, await kakaoUserRes.text());
      res.status(401).json({ error: 'kakao-user-fetch-failed' });
      return;
    }
    const kakaoUser = await kakaoUserRes.json();
    const profile = kakaoUser.kakao_account?.profile || {};
    const nickname = profile.nickname || '카카오 사용자';
    // 카카오는 오래된 계정일수록 프로필 사진 주소를 http://로 내려주는
    // 경우가 있다(HTTPS로 서빙되는 우리 앱 안에서 이 주소로 이미지를 직접
    // 불러오면 Mixed Content 경고가 뜬다 — 최신 브라우저가 자동으로
    // https로 바꿔서 열어주긴 하지만, 애초에 깨끗한 주소로 받아 저장하는
    // 게 맞다).
    const rawPhotoURL = profile.profile_image_url || null;
    const photoURL = rawPhotoURL ? rawPhotoURL.replace(/^http:\/\//, 'https://') : null;

    const uid = `kakao:${kakaoUser.id}`;
    const customToken = await admin.auth().createCustomToken(uid, { email_verified: true });

    res.status(200).json({ customToken, nickname, photoURL });
  } catch (err) {
    console.error('exchangeKakaoCode error', err);
    res.status(500).json({ error: 'internal' });
  }
});
