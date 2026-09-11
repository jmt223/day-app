const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

admin.initializeApp({ storageBucket: 'day-app-6e618.firebasestorage.app' });

const db = admin.firestore();
const bucket = admin.storage().bucket();

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

// 알림 종류를 사용자가 알림 설정 화면에서 끄고 켜는 5개 카테고리로 묶는다.
// friend_request/friend_accept는 둘 다 "친구 알림" 하나로 취급한다.
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
};

// 클라이언트 src/i18n/translations.ts의 notifications.* 키와 같은 문구다.
// Cloud Functions는 클라이언트 번들과 별도로 배포되는 독립 코드라 그
// 파일을 그대로 가져다 쓸 수 없어서, 여기서만 쓰는 알림 6종 문구만 따로
// 복사해둔다 — 문구를 바꾸면 양쪽 다 맞춰줘야 한다.
const PUSH_MESSAGES = {
  ko: {
    tag: (n, d) => `${n}님이 '${d}'에 회원님을 태그했어요`,
    comment: (n, d) => `${n}님이 '${d}'에 댓글을 남겼어요`,
    like: (n, d) => `${n}님이 '${d}'을 좋아해요`,
    friend_request: (n) => `${n}님이 친구 요청을 보냈어요`,
    friend_accept: (n) => `${n}님이 친구 요청을 수락했어요`,
    memory: (n, d, years) => `${years}년 전 오늘, '${d}'을 기록했어요`,
    letter_received: (n) => `${n}님의 펫이 편지를 물고 왔어요`,
    letter_replied: (n) => `${n}님이 답장을 보냈어요`,
    letter_expired: (n) => `${n}님에게 보낸 편지가 답장 없이 돌아왔어요`,
    pet_summon: (n) => `${n}님이 펫을 보내달라고 해요`,
    default: () => '새 알림이 있어요',
  },
  en: {
    tag: (n, d) => `${n} tagged you in '${d}'`,
    comment: (n, d) => `${n} commented on '${d}'`,
    like: (n, d) => `${n} liked '${d}'`,
    friend_request: (n) => `${n} sent you a friend request`,
    friend_accept: (n) => `${n} accepted your friend request`,
    memory: (n, d, years) => `${years} year(s) ago today, you recorded '${d}'`,
    letter_received: (n) => `${n}'s pet brought you a letter`,
    letter_replied: (n) => `${n} replied to your letter`,
    letter_expired: (n) => `Your letter to ${n} came back unanswered`,
    pet_summon: (n) => `${n} is asking you to send your pet`,
    default: () => 'You have a new notification',
  },
};

/** userLocale은 users/{uid} 문서의 locale 필드(클라이언트가 언어를 바꿀 때마다
 * 기록해둔 실제 언어) — 없으면(예: 이 기능 이전 가입자) 한국어로 취급한다. */
function pushMessageFor(notification, userLocale) {
  const messages = PUSH_MESSAGES[userLocale] || PUSH_MESSAGES.ko;
  const build = messages[notification.type] || messages.default;
  return build(notification.fromNickname, notification.dayTitle, notification.yearsAgo);
}

/**
 * users/{uid}/notifications/{notificationId} 문서가 새로 생기면(좋아요/댓글/
 * 태그/친구요청/친구수락), 그 알림 주인(uid)에게 실제 기기 푸시를 보낸다.
 * 인앱 알림함(client의 sendNotification)은 항상 기록되고, 이 함수는 그중
 * "이 사람이 이 종류의 알림을 푸시로도 받기로 했는지"만 추가로 판단한다.
 */
exports.sendPushOnNotification = onDocumentCreated(
  { document: 'users/{uid}/notifications/{notificationId}', region: 'asia-northeast3' },
  async (event) => {
    const notification = event.data?.data();
    if (!notification) return;

    const uid = event.params.uid;
    const category = NOTIFICATION_CATEGORY[notification.type];
    if (!category) return;

    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) return;
    const userData = userSnap.data();

    const settings = userData.notificationSettings || {};
    // 설정에 값이 없는 카테고리는 기본 켜짐(true)으로 취급한다 — 이 필드가
    // 생기기 전에 가입한 계정도 계속 알림을 받아야 하기 때문이다.
    if (settings[category] === false) return;

    const tokens = Array.isArray(userData.pushTokens) ? userData.pushTokens : [];
    if (tokens.length === 0) return;

    const body = pushMessageFor(notification, userData.locale);
    const messages = tokens.map((token) => ({
      to: token,
      title: 'DAY',
      body,
      data: { type: notification.type, dayId: notification.dayId || null, letterId: notification.letterId || null },
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
        await db.doc(`users/${uid}`).update({
          pushTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens),
        });
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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.error('sendMemoryNotifications: failed for', docSnap.id, err);
      }
    }
  }
);

// 손상 확률 표. src/constants/pets.ts에 있는 값과 반드시 숫자를 맞춰야
// 한다(클라이언트 번들과 별도로 배포되는 독립 코드라 import로 공유할 수
// 없다 — 위 PUSH_MESSAGES와 같은 이유). 사용자와 "일단 합리적인 기본값,
// 나중에 조정"으로 합의된 값이라 실제 손상 롤은 여기(서버)에서만 한다 —
// pet.status(idle/away)가 이 기능의 유일한 도배 방지 장치라 클라이언트가
// 굴리게 두면 나쁜 롤을 스스로 조작할 수 있다.
const PET_SPECIES_BASE_DAMAGE_PERCENT = { sparrow: 8, owl: 5, squirrel: 12, turtle: 3 };
const PET_PERSONALITY_DAMAGE_MODIFIER_PERCENT = { playful: 4, timid: 2, easygoing: -2, careful: -4 };
const DAMAGE_LEVEL_WEIGHTS = [
  ['corner', 60],
  ['half', 30],
  ['total', 10],
];

function damageProbabilityPercent(species, personality) {
  const base = PET_SPECIES_BASE_DAMAGE_PERCENT[species] ?? 8;
  const modifier = PET_PERSONALITY_DAMAGE_MODIFIER_PERCENT[personality] ?? 0;
  return Math.min(25, Math.max(1, base + modifier));
}

function rollDamageLevel(species, personality) {
  const probability = damageProbabilityPercent(species, personality);
  if (Math.random() * 100 >= probability) return 'none';
  const totalWeight = DAMAGE_LEVEL_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * totalWeight;
  for (const [level, weight] of DAMAGE_LEVEL_WEIGHTS) {
    if (roll < weight) return level;
    roll -= weight;
  }
  return 'corner';
}

/**
 * 편지가 생성되면(firestore.rules가 이미 "보낸 사람의 idle 펫으로만"
 * 만들어졌음을 검증함) 그 펫의 실제 문서(species/personality — 클라이언트가
 * 편지에 같이 써넣은 값이 아니라 펫 문서 원본을 다시 읽어서 조작 여지를
 * 없앤다)로 손상 확률을 굴려 outboundDamage를 채우고, replyDeadline을
 * 계산한다. 받는 사람에게는 기존 알림 인프라(users/{uid}/notifications ->
 * sendPushOnNotification)를 그대로 재사용해 도착 알림을 보낸다.
 */
exports.onLetterCreated = onDocumentCreated(
  { document: 'letters/{letterId}', region: 'asia-northeast3' },
  async (event) => {
    const letter = event.data?.data();
    if (!letter) return;
    const letterId = event.params.letterId;

    const petSnap = await db.doc(`users/${letter.fromUid}/pets/${letter.fromPetId}`).get();
    const species = petSnap.exists ? petSnap.data().species : letter.fromPetSpecies;
    const personality = petSnap.exists ? petSnap.data().personality : 'easygoing';
    const outboundDamage = rollDamageLevel(species, personality);

    const createdAtMs = letter.createdAt ? letter.createdAt.toMillis() : Date.now();
    const replyDeadline = admin.firestore.Timestamp.fromMillis(createdAtMs + letter.waitHours * 60 * 60 * 1000);

    await db.doc(`letters/${letterId}`).update({ outboundDamage, replyDeadline });

    await db
      .collection(`users/${letter.toUid}/notifications`)
      .add({
        type: 'letter_received',
        fromUid: letter.fromUid,
        fromNickname: letter.fromNickname,
        letterId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      .catch((err) => console.error('onLetterCreated: notify failed', err));
  }
);

/**
 * 답장이 도착하면(letters/{letterId}/reply/main) 왕복 구간의 손상을 다시
 * 굴리고(갈 때/올 때 각각 독립적으로 손상될 수 있다는 컨셉), 부모 편지를
 * 'replied'로, 발신 펫을 idle로 되돌린다. away -> idle 전환은 이 트리거와
 * expireOverdueLetters 딱 두 곳에서만 일어난다(firestore.rules의 pets
 * 규칙 참고 — 클라이언트는 이 방향으로 못 바꾼다).
 */
exports.onLetterReplyCreated = onDocumentCreated(
  { document: 'letters/{letterId}/reply/{replyId}', region: 'asia-northeast3' },
  async (event) => {
    const reply = event.data?.data();
    if (!reply) return;
    const { letterId } = event.params;

    const letterRef = db.doc(`letters/${letterId}`);
    const letterSnap = await letterRef.get();
    if (!letterSnap.exists) return;
    const letter = letterSnap.data();
    if (letter.status !== 'awaiting_reply') return;

    const petRef = db.doc(`users/${letter.fromUid}/pets/${letter.fromPetId}`);
    const petSnap = await petRef.get();
    const species = petSnap.exists ? petSnap.data().species : letter.fromPetSpecies;
    const personality = petSnap.exists ? petSnap.data().personality : 'easygoing';
    const damage = rollDamageLevel(species, personality);

    const batch = db.batch();
    batch.update(event.data.ref, { damage });
    batch.update(letterRef, { status: 'replied', repliedAt: admin.firestore.FieldValue.serverTimestamp() });
    if (petSnap.exists) {
      batch.update(petRef, { status: 'idle', currentLetterId: null });
    }
    await batch.commit();

    await db
      .collection(`users/${letter.fromUid}/notifications`)
      .add({
        type: 'letter_replied',
        fromUid: letter.toUid,
        fromNickname: letter.toNickname,
        letterId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      .catch((err) => console.error('onLetterReplyCreated: notify failed', err));
  }
);

/**
 * 15분마다 답장 대기시간이 지난 편지를 정리한다 — 회고 알림(하루 한 번)과
 * 달리 편지는 "몇 시간 대기" 단위의 상대적으로 촘촘한 타이머라 더 자주
 * 돌아야 체감 지연이 작다(임의 기본값, 나중에 조정 가능). 정리 대상 편지의
 * 발신 펫도 이 함수에서 idle로 되돌린다 — 답장을 못 받은 채 시간이
 * 끝나도 펫은 돌아와야 다음 편지를 보낼 수 있다.
 */
exports.expireOverdueLetters = onSchedule(
  { schedule: '*/15 * * * *', timeZone: 'Asia/Seoul', region: 'asia-northeast3' },
  async () => {
    const now = admin.firestore.Timestamp.now();
    const snap = await db
      .collection('letters')
      .where('status', '==', 'awaiting_reply')
      .where('replyDeadline', '<=', now)
      .get();
    if (snap.empty) return;

    for (const docSnap of snap.docs) {
      const letter = docSnap.data();
      try {
        // onLetterReplyCreated와 같은 이유로 펫 문서 존재를 먼저 확인한다
        // — 없는 문서를 update()하면 그 배치 전체가 실패해서, 이 편지가
        // 영영 'expired'로 못 바뀌고 15분마다 계속 같은 자리에서 재시도만
        // 반복하게 된다(지금은 펫을 지우는 기능 자체가 없어 실제로 벌어질
        // 상황은 아니지만, 나중에 생기더라도 이 정리 작업만은 항상
        // 끝나야 한다).
        const petRef = db.doc(`users/${letter.fromUid}/pets/${letter.fromPetId}`);
        const petSnap = await petRef.get();

        const batch = db.batch();
        batch.update(docSnap.ref, { status: 'expired', expiredAt: now });
        if (petSnap.exists) {
          batch.update(petRef, { status: 'idle', currentLetterId: null });
        }
        await batch.commit();

        await db.collection(`users/${letter.fromUid}/notifications`).add({
          type: 'letter_expired',
          fromUid: letter.toUid,
          fromNickname: letter.toNickname,
          letterId: docSnap.id,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.error('expireOverdueLetters: failed for', docSnap.id, err);
      }
    }
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
