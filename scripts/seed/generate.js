#!/usr/bin/env node
'use strict';
/**
 * DAY 앱 테스트 데이터 생성기 — 로컬 Firebase 에뮬레이터(demo-day-app) 전용.
 *
 *   1) npm run emu      에뮬레이터 켜기(Auth/Firestore/Functions/Storage)
 *   2) npm run seed     이 스크립트: 에뮬레이터를 비우고 테스트 데이터를 새로 깐다
 *   3) npm run web:emu  웹 앱을 에뮬레이터에 붙여서 실행
 *
 * 실제 사용자처럼 보이게: 1년 넘게 쌓인 DAY(사람마다 활동량·관심사 다름),
 * 친구 무리(가족/회사/동아리…)와 그룹, 좋아요·댓글, 펫과 편지(답장/시간 종료/조기
 * 복귀/계속 머묾/회수/펫 보내줘/손상/재문의), 알림, 차단·신고까지 만든다. 시각은
 * 전부 "지금" 기준이라, 돌릴 때마다 오늘 날짜에 맞는 데이터가 생긴다.
 *
 * 옵션: --users=150  --seed=20261112  --photos=false
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_ID = 'demo-day-app';
const HOST = '127.0.0.1';
const PORT = { firestore: 8080, auth: 9099, storage: 9199, hub: 4400 };

// firebase-admin을 불러오기 "전에" 에뮬레이터 주소를 박아서, 어떤 경우에도 운영
// 서버로 나가지 않게 한다(demo- 프로젝트라 실수로 나가도 실제 프로젝트가 없다).
process.env.FIRESTORE_EMULATOR_HOST = `${HOST}:${PORT.firestore}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `${HOST}:${PORT.auth}`;
process.env.FIREBASE_STORAGE_EMULATOR_HOST = `${HOST}:${PORT.storage}`;
process.env.STORAGE_EMULATOR_HOST = `http://${HOST}:${PORT.storage}`;
process.env.GCLOUD_PROJECT = PROJECT_ID;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const fnRequire = createRequire(path.join(ROOT, 'functions', 'package.json'));
const admin = fnRequire('firebase-admin');
const { Timestamp } = fnRequire('firebase-admin/firestore');
const petLogic = require(path.join(ROOT, 'functions', 'pet-logic.js'));
const { DEFAULT_PET_RULES } = require(path.join(ROOT, 'functions', 'pet-config.js'));
const C = require('./corpus');
const PHOTOS = require('./photo-ids.json');
const { MIN, HOUR, DAY, Rng, kstLabel, kstMidnightMs, addDays, monthOf } = require('./lib');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  })
);
const USER_COUNT = Math.max(40, Number(args.users || 150));
const SEED = Number(args.seed || 20261112);
const WITH_PHOTOS = args.photos !== 'false';
const DRY = args.dry === 'true'; // 쓰지 않고 설계·검사만
const PASSWORD = 'test1234!';
const CACHE_DIR = path.join(ROOT, '.seed-cache', 'photos');

/** 사진을 올릴 버킷 — servePhoto(functions/index.js)가 읽는 버킷과 같아야 사진이
 * 보인다. 그 파일에 박혀 있는 이름을 그대로 쓴다. 쓰기는 아래 assertLocalStorage가
 * 에뮬레이터로만 가는지 확인한 뒤에만 한다. */
function readBucket() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
    const m = src.match(/storageBucket:\s*'([^']+)'/);
    if (m) return m[1];
  } catch {
    // 못 읽으면 .env → 기본값
  }
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = env.match(/^EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=(.+)$/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch {
    // 기본값
  }
  return `${PROJECT_ID}.appspot.com`;
}

const BUCKET = readBucket();
admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket();

// ---------------------------------------------------------------------------
// 기본 도구
// ---------------------------------------------------------------------------
const rng = new Rng(SEED);
const idRng = new Rng(SEED ^ 0x5eed);
const rngFn = () => rng.next();
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function newId(len = 20) {
  let s = '';
  for (let i = 0; i < len; i++) s += B62[Math.floor(idRng.next() * 62)];
  return s;
}

const NOW = Date.now();
const TODAY = kstLabel(NOW);
const HISTORY_DAYS = 400;
const PET_LAUNCH = NOW - 68 * DAY; // 펫 편지 기능이 생긴 때(그 전엔 펫이 없음)
const NOTIFY_WINDOW = 60 * DAY; // 이보다 오래된 사건은 알림을 안 만든다(알림함엔 최근 것만 보임)
const ts = (ms) => Timestamp.fromMillis(Math.round(ms));
const clampNow = (ms, lo = 0) => Math.max(lo, Math.min(ms, NOW - MIN));
const expo = (mean) => -Math.log(1 - rng.next()) * mean;

const docs = []; // [경로, 데이터]
function put(p, data) {
  docs.push([p, data]);
}

/** 버킷 이름은 실제 프로젝트 것이라, 혹시라도 운영 Storage로 나가면 안 된다.
 * 업로드·삭제 전에 요청이 로컬 에뮬레이터로 가는지 확인한다. */
function assertLocalStorage() {
  const endpoint = String(bucket.storage.apiEndpoint || '');
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(endpoint)) {
    throw new Error(`Storage 요청이 에뮬레이터가 아니라 ${endpoint || '(알 수 없음)'}로 가려고 해서 멈췄어요.`);
  }
}

async function reachable(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2500) });
    return true;
  } catch {
    return false;
  }
}

async function pool(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// 사람
// ---------------------------------------------------------------------------
const GROUP_NAME = {
  family: '가족',
  friends: '친구',
  acq: '지인',
  work: '회사',
  club: '동아리',
  univ: '대학 동기',
  school: '고등학교',
  running: '러닝크루',
  study: '스터디',
};

/** 내 편지 상대들(손상 표현 14종을 다 보려고 펫 종을 하나씩 나눠 줌). */
const SHOWCASE = [
  { nick: '민지', email: 'minji', species: 'rabbit', pet: '콩이', personality: 'playful' },
  { nick: '서준', email: 'seojun', species: 'tiger', pet: '똘이', personality: 'easygoing' },
  { nick: '하윤', email: 'hayun', species: 'chicken', pet: '삐약이', personality: 'hasty' },
  { nick: '도윤', email: 'doyun', species: 'dog', pet: '보리', personality: 'reliable' },
  { nick: '예린', email: 'yerin', species: 'cat', pet: '나나', personality: 'timid' },
  { nick: '시우', email: 'siwoo', species: 'dragon', pet: '용용이', personality: 'careful' },
  { nick: '유나', species: 'bird', pet: '짹짹이', personality: 'playful' },
  { nick: '지호', species: 'horse', pet: '갈기', personality: 'hasty' },
  { nick: '다은', species: 'cow', pet: '음메', personality: 'easygoing' },
  { nick: '준호', species: 'pig', pet: '꿀꿀이', personality: 'playful' },
  { nick: '소연', species: 'rat', pet: '찍찍이', personality: 'timid' },
  { nick: '태윤', species: 'snake', pet: '스르륵', personality: 'careful' },
  { nick: '나연', species: 'sheep', pet: '몽실이', personality: 'reliable' },
  { nick: '승민', species: 'monkey', pet: '끼끼', personality: 'hasty' },
];
const ROLE_EMAIL = { 루비맘: 'heavy', 밤하늘: 'blocker', 이벤트당첨안내: 'spam' };
for (const s of SHOWCASE) if (s.email) ROLE_EMAIL[s.nick] = s.email;

const ADJ = ['졸린', '배고픈', '행복한', '느긋한', '용감한', '수줍은', '신난', '조용한', '부지런한', '엉뚱한'];
const NOUN = ['판다', '고양이', '여우', '곰', '토끼', '다람쥐', '펭귄', '수달', '고래', '참새'];
const SPECIES_WEIGHTS = [
  ['dog', 18], ['cat', 16], ['rabbit', 8], ['bird', 8], ['horse', 4], ['cow', 3], ['pig', 4],
  ['rat', 3], ['tiger', 5], ['dragon', 5], ['snake', 3], ['sheep', 4], ['monkey', 4], ['chicken', 4],
];
const PERSONALITIES = ['hasty', 'easygoing', 'careful', 'playful', 'timid', 'reliable'];

const users = [];
const byUid = new Map();
const role = {};

function avatarURL(photoId) {
  return `https://images.unsplash.com/photo-${photoId}?w=240&h=240&fit=crop&q=70`;
}

function makeUser(spec) {
  const u = {
    idx: users.length,
    key: spec.key || null,
    uid: spec.uid || newId(28),
    email: spec.email === undefined ? null : spec.email,
    nickname: spec.nickname,
    oldNickname: null,
    renamedAt: 0,
    photoURL: spec.photoURL === undefined ? (rng.chance(0.62) ? avatarURL(rng.pick(PHOTOS.avatars)) : null) : spec.photoURL,
    bio: spec.bio ?? rng.pick(C.BIOS),
    locale: spec.locale || 'ko',
    joined: spec.joined,
    verified: spec.verified !== false,
    consent: spec.consent !== false,
    level: spec.level ?? 0,
    cap: spec.cap ?? 70,
    favs: rng.sample(C.THEMES.filter((t) => !t.months).map((t) => t.key), rng.int(4, 7)),
    groups: [],
    friends: new Map(),
    blocked: new Map(),
    pets: [],
    days: [],
    letterFriends: [],
    letterGap: spec.letterGap ?? rng.weighted([[1.5 * DAY, 20], [4 * DAY, 40], [11 * DAY, 25], [0, 15]]),
    care: rng.next() * 0.7 + 0.1,
    noContent: !!spec.noContent,
    notificationSettings: spec.notificationSettings,
  };
  ['가족', '친구', '지인'].forEach((name, order) => u.groups.push({ id: newId(), name, order, created: u.joined }));
  users.push(u);
  byUid.set(u.uid, u);
  if (u.key) role[u.key] = u;
  return u;
}

function nickAt(u, ms) {
  return u.oldNickname && ms < u.renamedAt ? u.oldNickname : u.nickname;
}

function ensureGroup(u, name) {
  let g = u.groups.find((x) => x.name === name);
  if (!g) {
    g = { id: newId(), name, order: u.groups.length, created: Math.min(NOW - HOUR, u.joined + rng.int(1, 20) * DAY) };
    u.groups.push(g);
  }
  return g;
}

function befriend(a, b, typeA, typeB, since) {
  if (!a || !b || a === b || a.friends.has(b.uid) || a.noContent || b.noContent) return;
  const s = since ?? clampNow(Math.max(a.joined, b.joined) + rng.int(0, 20) * DAY + rng.int(0, 23) * HOUR, Math.max(a.joined, b.joined));
  const ga = ensureGroup(a, GROUP_NAME[typeA]);
  const gb = ensureGroup(b, GROUP_NAME[typeB ?? typeA]);
  a.friends.set(b.uid, { groupId: ga.id, groupName: ga.name, since: s });
  b.friends.set(a.uid, { groupId: gb.id, groupName: gb.name, since: s });
}

function buildPeople() {
  // 특별한 역할의 계정(로그인해서 기능별로 확인하는 용도)
  makeUser({ key: 'me', nickname: '지민', email: 'me@day.test', bio: '오늘을 기록합니다 📒', joined: NOW - HISTORY_DAYS * DAY, level: 0.42, cap: 170, letterGap: 1.2 * DAY, photoURL: avatarURL(PHOTOS.avatars[7]) });
  makeUser({ key: 'new', nickname: '새내기', email: 'new@day.test', bio: '', joined: NOW - 30 * MIN, noContent: true, photoURL: null, letterGap: 0 });
  makeUser({ key: 'mission', nickname: '미션왕', email: 'mission@day.test', joined: NOW - 40 * DAY, level: 0.3, cap: 12, letterGap: 3 * DAY });
  makeUser({ key: 'unverified', nickname: '인증대기', email: 'unverified@day.test', joined: NOW - 2 * HOUR, verified: false, noContent: true, photoURL: null, letterGap: 0 });
  makeUser({ key: 'noconsent', nickname: '약관미동의', email: 'noconsent@day.test', joined: NOW - HOUR, consent: false, noContent: true, photoURL: null, letterGap: 0 });
  makeUser({ key: 'legacy', nickname: '옛날사람', email: 'legacy@day.test', joined: NOW - 380 * DAY, level: 0.08, cap: 25, letterGap: 0 });
  makeUser({ key: 'en', nickname: 'Alex', email: 'en@day.test', bio: 'Seoul life, one day at a time', locale: 'en', joined: NOW - 120 * DAY, level: 0.12, cap: 15, notificationSettings: { like: false, memory: false } });

  // 보통 사람들
  const names = [...new Set([
    ...SHOWCASE.map((s) => s.nick),
    '루비맘', '밤하늘', '이벤트당첨안내',
    ...C.NICKNAMES,
    ...rng.shuffle(ADJ.flatMap((a) => NOUN.map((n) => `${a}${n}`))),
  ])];
  const regularCount = USER_COUNT - users.length;
  const kakaoSlots = new Set(rng.sample([...Array(regularCount).keys()].filter((i) => !ROLE_EMAIL[names[i]]), 4));
  for (let i = 0; i < regularCount; i++) {
    const nickname = names[i] || `친구${i}`;
    const kakao = kakaoSlots.has(i);
    const r = rng.next();
    const joined = r < 0.7 ? NOW - rng.int(60, 395) * DAY : r < 0.9 ? NOW - rng.int(14, 60) * DAY : NOW - rng.int(1, 14) * DAY;
    const level = rng.weighted([[0.03, 15], [0.08, 25], [0.15, 25], [0.3, 20], [0.5, 10], [0.75, 5]]);
    const spec = {
      nickname,
      uid: kakao ? `kakao:${rng.int(1000000000, 3999999999)}` : undefined,
      email: kakao ? null : ROLE_EMAIL[nickname] ? `${ROLE_EMAIL[nickname]}@day.test` : `user${String(i + 1).padStart(3, '0')}@day.test`,
      joined: joined - rng.int(0, 23) * HOUR,
      level,
      cap: rng.int(20, 75),
      notificationSettings: rng.chance(0.25) ? { [rng.pick(['tag', 'comment', 'like', 'friend', 'memory', 'letter'])]: false } : undefined,
    };
    if (SHOWCASE.some((s) => s.nick === nickname)) {
      spec.photoURL = avatarURL(PHOTOS.avatars[(i * 5) % PHOTOS.avatars.length]);
      spec.joined = NOW - rng.int(200, 390) * DAY;
      spec.level = rng.pick([0.15, 0.3, 0.45]);
      spec.letterGap = rng.pick([1.5 * DAY, 2.5 * DAY, 4 * DAY]);
    }
    if (nickname === '루비맘') Object.assign(spec, { key: 'heavy', joined: NOW - 395 * DAY, level: 0.95, cap: 380, bio: '보리 엄마 🐶 매일 기록 중' });
    if (nickname === '밤하늘') Object.assign(spec, { key: 'blocker', joined: NOW - 300 * DAY });
    if (nickname === '이벤트당첨안내') Object.assign(spec, { key: 'spam', joined: NOW - 25 * DAY, level: 0, cap: 0, bio: '🎁 무료 이벤트 진행 중', photoURL: null, letterGap: 0 });
    const u = makeUser(spec);
    // 닉네임을 중간에 바꾼 사람: 예전 글·댓글에는 옛 닉네임이 박혀 있다(화면은 최신 프로필로 덮어써야 함)
    if (!u.key && !SHOWCASE.some((s) => s.nick === nickname) && rng.chance(0.08)) {
      u.oldNickname = `${nickname}_${rng.int(10, 99)}`;
      u.renamedAt = clampNow(u.joined + rng.int(10, 200) * DAY, u.joined + DAY);
    }
  }
}

function buildFriendships() {
  const me = role.me;
  const regulars = users.filter((u) => !u.key && !u.noContent);
  const showcase = SHOWCASE.map((s) => users.find((u) => u.nickname === s.nick)).filter(Boolean);
  const pick = (n, exclude) => rng.sample(regulars.filter((u) => !exclude.has(u)), n);
  const taken = new Set(showcase);

  // 내 친구 무리: 가족/친구/지인/회사/동아리
  const circles = {
    family: pick(4, taken),
    friends: [...showcase, ...pick(3, taken)],
    acq: [],
    work: [],
    club: [],
  };
  circles.family.forEach((u) => taken.add(u));
  circles.friends.forEach((u) => taken.add(u));
  circles.acq = pick(10, taken);
  circles.acq.forEach((u) => taken.add(u));
  circles.work = pick(9, taken);
  circles.work.forEach((u) => taken.add(u));
  circles.club = pick(6, taken);
  for (const [type, members] of Object.entries(circles)) {
    for (const m of members) befriend(me, m, type, type === 'acq' ? 'acq' : type, clampNow(Math.max(me.joined, m.joined) + rng.int(0, 10) * DAY, me.joined));
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) if (rng.chance(type === 'family' ? 0.9 : 0.5)) befriend(members[i], members[j], type);
  }
  me.circles = circles;
  me.letterPartners = [...showcase, ...rng.sample(circles.friends.slice(showcase.length), 3)];

  // 다른 사람들끼리의 무리(학교/회사/동아리…)
  const clusterCount = Math.round(regulars.length / 4);
  for (let c = 0; c < clusterCount; c++) {
    const type = rng.weighted([['friends', 28], ['school', 12], ['univ', 12], ['work', 15], ['club', 10], ['running', 6], ['study', 6], ['acq', 6], ['family', 5]]);
    const size = type === 'family' ? rng.int(2, 4) : rng.int(5, 13);
    const members = rng.sample(regulars, size);
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) if (rng.chance(type === 'family' ? 0.95 : 0.55)) befriend(members[i], members[j], type);
  }
  for (const u of regulars) for (let k = rng.int(0, 3); k > 0; k--) befriend(u, rng.pick(regulars), rng.pick(['acq', 'friends']), rng.pick(['acq', 'friends']));

  // 특별 계정들
  const mission = role.mission;
  for (const m of rng.sample(regulars, 6)) befriend(mission, m, 'friends');
  befriend(role.legacy, me, 'acq');
  for (const m of rng.sample(regulars, 3)) befriend(role.legacy, m, 'friends');
  befriend(role.en, me, 'acq');
  for (const m of rng.sample(regulars, 4)) befriend(role.en, m, 'acq');
  const heavy = role.heavy;
  for (const m of rng.sample(regulars, 25)) befriend(heavy, m, rng.pick(['friends', 'acq', 'club']));
  befriend(heavy, me, 'club');

  // 스팸 계정은 친구가 없다. 밤하늘은 나를 차단했다(차단하면 양쪽 친구 관계도 끊긴다).
  const spam = role.spam;
  for (const u of [...spam.friends.keys()].map((id) => byUid.get(id))) {
    u.friends.delete(spam.uid);
  }
  spam.friends.clear();
  const blocker = role.blocker;
  for (const m of rng.sample(regulars, 8)) befriend(blocker, m, rng.pick(['friends', 'acq']));
  blocker.friends.delete(me.uid);
  me.friends.delete(blocker.uid);
  blocker.blocked.set(me.uid, { nickname: me.nickname, at: NOW - rng.int(5, 20) * DAY });
  me.blocked.set(spam.uid, { nickname: spam.nickname, at: NOW - 4 * DAY });
  // 그 밖에 몇 건의 차단
  for (let k = 0; k < 12; k++) {
    const a = rng.pick(regulars);
    const b = rng.pick(regulars);
    if (a === b || a.friends.has(b.uid)) continue;
    a.blocked.set(b.uid, { nickname: b.nickname, at: NOW - rng.int(1, 120) * DAY });
  }
}

// ---------------------------------------------------------------------------
// DAY
// ---------------------------------------------------------------------------
const THEME = Object.fromEntries(C.THEMES.map((t) => [t.key, t]));
const COMMON = ['daily', 'cafe', 'food', 'walk', 'work_overtime'];
const PHOTO_HEAVY = new Set(['food', 'cafe', 'dessert', 'travel_domestic', 'travel_abroad', 'pet_dog', 'pet_cat', 'walk', 'hiking', 'birthday', 'spring', 'autumn', 'winter', 'concert', 'cooking', 'love', 'friends', 'drinks', 'running', 'gym']);
const PHOTO_LIGHT = new Set(['work_overtime', 'work_first', 'study_exam', 'quit', 'sick', 'lonely', 'daily', 'rain', 'book', 'shopping']);
const FONTS = ['gowun', 'nanum', 'jua', 'doHyeon', 'blackHanSans', 'gaegu', 'hiMelody', 'poorStory', 'nanumPen', 'nanumBrush', 'eastSeaDokdo', 'songMyung'];
const usedPhotoIds = new Set();
const dayIndex = new Map();
const allDays = [];

function aspectOf(photoId) {
  let h = 0;
  for (const ch of photoId) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  return h % 100 < 55 ? 'landscape' : h % 100 < 85 ? 'portrait' : 'square';
}

function pickTheme(u, label) {
  const m = monthOf(label);
  const seasonal = C.THEMES.filter((t) => t.months && t.months.includes(m));
  if (seasonal.length && rng.chance(0.16)) return rng.pick(seasonal);
  if (rng.chance(0.55)) return THEME[rng.pick(u.favs)];
  if (rng.chance(0.4)) return THEME[rng.pick(COMMON)];
  return rng.pick(C.THEMES.filter((t) => !t.months));
}

/** 그 날짜의 DAY를 실제로 쓴 시각. 쓸 수 있는 시간(그날 0시 ~ 다음날 오전 10시) 안에서
 * 고르고, 아직 오지 않은 시각이 뽑히면 "아직 안 쓴 것"으로 보고 건너뛴다 — 그래서 자정
 * 직후에 돌리면 오늘 글이 거의 없고, 저녁에 돌리면 많다(예전엔 미래 시각을 "방금 전"으로
 * 당겨서 오늘 글이 몇 분 전에 몰려 있었다). */
function pickCreated(label) {
  const mid = kstMidnightMs(label);
  const r = rng.next();
  let t;
  if (r < 0.06) t = mid + DAY + rng.int(30, 590) * MIN;
  else if (r < 0.25) t = mid + rng.int(7 * 60, 12 * 60) * MIN;
  else t = mid + rng.int(12 * 60, 23 * 60 + 58) * MIN;
  return t > NOW - 3 * MIN ? null : t;
}

function placeOf(name) {
  if (!C.PLACES[name]) return null;
  const [lat, lng] = C.PLACES[name];
  return { name, lat: +(lat + (rng.next() - 0.5) * 0.004).toFixed(6), lng: +(lng + (rng.next() - 0.5) * 0.004).toFixed(6) };
}

function makeDay(u, label, opt = {}) {
  const theme = opt.theme ? THEME[opt.theme] : pickTheme(u, label);
  const created = opt.created ?? pickCreated(label);
  if (created == null) return null;
  const id = newId();

  // 본문: 문장 2~5개를 1~3덩어리로
  const lines = opt.lines || rng.sample(theme.lines, rng.int(2, Math.min(5, theme.lines.length)));
  if (!opt.lines && rng.chance(0.15)) lines.push(rng.pick(THEME.daily.lines));
  const chunks = [];
  const pieces = Math.min(lines.length, rng.int(1, 3));
  for (let i = 0; i < pieces; i++) chunks.push([]);
  lines.forEach((l, i) => chunks[Math.min(pieces - 1, Math.floor((i * pieces) / lines.length))].push(l));
  const texts = chunks.map((c) => c.join(' '));

  // 사진
  const photoProb = PHOTO_HEAVY.has(theme.key) ? 0.55 : PHOTO_LIGHT.has(theme.key) ? 0.16 : 0.32;
  let photoCount = 0;
  if (WITH_PHOTOS && opt.photos !== 0 && (opt.photos || rng.chance(photoProb))) photoCount = opt.photos || rng.weighted([[1, 55], [2, 30], [3, 15]]);
  const photoPool = [...new Set(theme.photos.flatMap((cat) => PHOTOS.themes[cat] || []))];
  const photoIds = rng.sample(photoPool, photoCount);
  const photos = photoIds.map((pid, i) => {
    usedPhotoIds.add(pid);
    return { pid, aspect: aspectOf(pid), path: `days/${u.uid}/${id}/${Math.round(created) + i}-${newId(6).toLowerCase()}.jpg` };
  });

  // 글과 사진을 섞는 모양
  const blocks = [];
  const style = rng.int(0, 2);
  if (style === 0 || photos.length === 0) {
    texts.forEach((text) => blocks.push({ type: 'text', text }));
    photos.forEach((_, i) => blocks.push({ type: 'photo', photoIndex: i }));
  } else if (style === 1) {
    photos.forEach((_, i) => {
      blocks.push({ type: 'photo', photoIndex: i });
      if (texts[i]) blocks.push({ type: 'text', text: texts[i] });
    });
    texts.slice(photos.length).forEach((text) => blocks.push({ type: 'text', text }));
  } else {
    texts.forEach((text, i) => {
      blocks.push({ type: 'text', text });
      if (photos[i]) blocks.push({ type: 'photo', photoIndex: i });
    });
    photos.slice(texts.length).forEach((_, i) => blocks.push({ type: 'photo', photoIndex: texts.length + i }));
  }

  // 공개범위
  let vis = opt.visibility || rng.weighted([['public', 55], ['friends', 28], ['group', 9], ['private', 8]]);
  if (!opt.visibility && ['lonely', 'sick'].includes(theme.key)) vis = rng.weighted([['friends', 40], ['private', 35], ['public', 15], ['group', 10]]);
  if (u.friends.size === 0 && vis !== 'private' && vis !== 'public') vis = 'public';
  let groupId = null;
  if (vis === 'group') {
    const used = new Set([...u.friends.values()].map((f) => f.groupId));
    const groups = u.groups.filter((g) => used.has(g.id));
    if (groups.length === 0) vis = 'friends';
    else groupId = rng.pick(groups).id;
  }

  // 태그는 이 글을 읽을 수 있는 친구만(나만 보기 글엔 태그 안 함)
  const friendsThen = [...u.friends.entries()]
    .filter(([, f]) => f.since <= created && (vis !== 'group' || f.groupId === groupId))
    .map(([uid]) => uid);
  const tagged = opt.tagged ?? (vis !== 'private' && friendsThen.length && rng.chance(0.2) ? rng.sample(friendsThen, rng.int(1, 3)) : []);

  let location = null;
  if (theme.places && rng.chance(0.55)) location = placeOf(rng.pick(theme.places));
  else if (rng.chance(0.07)) location = placeOf(rng.pick(C.CITY_PLACES));

  const r = rng.next();
  const editCount = opt.editCount ?? (r < 0.08 ? 1 : r < 0.1 ? 2 : 0);
  const day = {
    id,
    author: u,
    label,
    created,
    updated: editCount ? clampNow(created + rng.int(10, 20 * 60) * MIN, created) : created,
    theme: theme.key,
    title: (opt.title || rng.pick(theme.titles)).slice(0, 40),
    blocks,
    photos,
    vis,
    groupId,
    tagged,
    mood: opt.mood !== undefined ? opt.mood : rng.chance(0.88) ? rng.pick(theme.moods) : null,
    location,
    font: rng.chance(0.45) ? 'gowun' : rng.pick(FONTS),
    align: rng.weighted([['left', 85], ['center', 12], ['right', 3]]),
    feed: opt.feed ?? (vis === 'public' ? rng.chance(0.88) : rng.chance(0.7)),
    history: opt.history ?? rng.chance(0.92),
    editCount,
    deleted: opt.deleted ?? rng.chance(0.015),
    status: opt.status || 'confirmed',
    likes: [],
    comments: [],
  };
  u.days.push(day);
  allDays.push(day);
  dayIndex.set(id, day);
  return day;
}

function weekdayOf(label) {
  return new Date(kstMidnightMs(label) + 9 * HOUR).getUTCDay();
}

function buildDays() {
  for (const u of users) {
    if (u.noContent || !u.level) continue;
    const start = kstLabel(u.joined + 30 * MIN);
    const span = Math.max(1, Math.round((NOW - u.joined) / DAY));
    // 주말 가중치(평균 1.03배)와 하루 두 개 쓰는 날(6%)을 감안해서, 평균적으로 cap개
    // 근처에서 멈추게 한다. 중간에 cap에서 끊으면 최근 몇 주가 비어 버린다.
    const p = Math.min(u.level, u.cap / span) / 1.09;
    for (let label = start; label <= TODAY; label = addDays(label, 1)) {
      const wd = weekdayOf(label);
      const q = p * (wd === 0 || wd === 6 ? 1.35 : 0.9);
      if (rng.chance(q)) makeDay(u, label);
      if (rng.chance(q * 0.06)) makeDay(u, label);
    }
  }
  // 두 번째 펫 미션(DAY 7개)을 채운 상태여야 하는 계정
  const mission = role.mission;
  for (let back = 1; mission.days.filter((d) => !d.deleted).length < 9 && back < 35; back += 2) {
    const label = addDays(TODAY, -back);
    if (!mission.days.some((d) => d.label === label)) makeDay(mission, label, { deleted: false });
  }

  const me = role.me;
  // 1년 전 오늘(회고 알림)
  const [y, m, d] = TODAY.split('-');
  const yearAgo = `${Number(y) - 1}-${m}-${d}`;
  me.memoryDay = makeDay(me, yearAgo, { theme: 'travel_domestic', title: '제주 여행 첫날', visibility: 'public', photos: 2, deleted: false, history: true });
  // 오늘의 DAY(홈 상단에 이름이 뜨는지)
  if (!me.days.some((x) => x.label === TODAY && x.status === 'confirmed' && !x.deleted)) {
    const mid = kstMidnightMs(TODAY);
    const created = NOW - mid > 3 * HOUR ? NOW - rng.int(30, 150) * MIN : NOW - 5 * MIN;
    makeDay(me, TODAY, { theme: 'autumn', title: '올해 첫 붕어빵 먹은 날', created, visibility: 'public', photos: 1, deleted: false, feed: true, history: true });
  }
  // 예정 DAY: 오늘 확정 가능 / 미래 / 기한 지난 것
  makeDay(me, TODAY, { theme: 'birthday', title: '친구 생일 파티 DAY', status: 'draft', created: NOW - 26 * HOUR, visibility: 'friends', photos: 0, deleted: false, editCount: 0 });
  makeDay(me, addDays(TODAY, 12), { theme: 'travel_domestic', title: '제주 여행 가는 날', status: 'draft', created: NOW - 3 * DAY, visibility: 'public', photos: 0, deleted: false, editCount: 0 });
  makeDay(me, addDays(TODAY, 30), { theme: 'home', title: '이사하는 날', status: 'draft', created: NOW - DAY, visibility: 'friends', photos: 0, deleted: false, editCount: 0 });
  makeDay(me, addDays(TODAY, -6), { theme: 'gym', title: '헬스 다시 시작하는 날', status: 'draft', created: NOW - 10 * DAY, visibility: 'public', photos: 0, deleted: false, editCount: 0 });
  // 다른 사람들의 예정 DAY
  for (const u of rng.sample(users.filter((x) => x.days.length > 3 && x !== me), 15)) {
    makeDay(u, addDays(TODAY, rng.int(2, 50)), { status: 'draft', created: NOW - rng.int(1, 6) * DAY, photos: 0, deleted: false, editCount: 0 });
  }
  // 친구들이 나를 태그한 DAY
  const myFriends = [...me.friends.keys()].map((id) => byUid.get(id));
  const tagCands = allDays.filter((x) => myFriends.includes(x.author) && canRead(x, me) && x.vis !== 'private' && x.created >= me.friends.get(x.author.uid).since && x.tagged.length < 20);
  me.taggedIn = rng.sample(tagCands, 22);
  for (const x of me.taggedIn) if (!x.tagged.includes(me.uid)) x.tagged.push(me.uid);
}

// ---------------------------------------------------------------------------
// 좋아요 · 댓글 · 알림
// ---------------------------------------------------------------------------
const notifications = []; // {to, id?, data}
function notify(to, at, data, fixedId) {
  if (!to || at < NOW - NOTIFY_WINDOW || to.noContent) return;
  const fresh = at > NOW - 2 * DAY;
  notifications.push({ to, id: fixedId || newId(), data: { ...data, read: fresh ? (to.key === 'me' ? rng.chance(0.25) : rng.chance(0.45)) : rng.chance(0.96), createdAt: ts(at) } });
}

function blockedEither(a, b) {
  return a.blocked.has(b.uid) || b.blocked.has(a.uid);
}

function canRead(day, viewer) {
  if (viewer === day.author) return true;
  if (day.status !== 'confirmed' || day.deleted) return false;
  if (day.vis === 'public') return true;
  const f = day.author.friends.get(viewer.uid);
  if (!f) return false;
  return day.vis === 'friends' || f.groupId === day.groupId;
}

function buildEngagement() {
  const active = users.filter((u) => !u.noContent && u.key !== 'spam');
  for (const day of allDays) {
    if (day.status !== 'confirmed' || day.vis === 'private') continue;
    const a = day.author;
    if (day.created > NOW - 3 * MIN) continue;
    const friends = [...a.friends.keys()].map((id) => byUid.get(id)).filter((v) => canRead(day, v) && !blockedEither(a, v));
    let cands = friends.map((v) => [v, 3]);
    if (day.vis === 'public' && day.feed) {
      const others = rng.sample(active, 60).filter((v) => v !== a && !a.friends.has(v.uid) && !blockedEither(a, v));
      cands = cands.concat(others.map((v) => [v, 1]));
    }
    const ageH = (NOW - day.created) / HOUR;
    const recency = ageH < 6 ? 0.3 : ageH < 24 ? 0.7 : 1;
    let lambda;
    if (day.vis === 'public' && day.feed) lambda = 2 + 0.22 * friends.length + (rng.chance(0.05) ? rng.int(15, 45) : 0);
    else if (day.vis === 'public') lambda = 0.2 * friends.length;
    else lambda = 0.25 * friends.length;
    const likeN = Math.min(cands.length, Math.round(lambda * recency * (0.5 + rng.next())));
    const pool = cands.slice();
    const likers = [];
    for (let k = 0; k < likeN && pool.length; k++) {
      const total = pool.reduce((s, [, w]) => s + w, 0);
      let roll = rng.next() * total;
      let idx = 0;
      while (idx < pool.length - 1 && roll >= pool[idx][1]) roll -= pool[idx++][1];
      likers.push(pool.splice(idx, 1)[0][0]);
    }
    for (const v of likers) {
      const at = clampNow(day.created + MIN + expo(5 * HOUR), Math.max(day.created + MIN, v.joined));
      if (at <= day.created) continue;
      day.likes.push({ uid: v.uid, at });
      notify(a, at, { type: 'like', fromUid: v.uid, fromNickname: nickAt(v, at), dayId: day.id, dayTitle: day.title }, `like_${day.id}_${v.uid}`);
    }

    // 댓글
    let cl;
    if (day.vis === 'public' && day.feed) cl = 0.5 + 0.05 * friends.length + (rng.chance(0.04) ? rng.int(3, 12) : 0);
    else cl = 0.12 * friends.length;
    const commentN = Math.min(25, Math.round(cl * recency * (0.4 + rng.next())));
    const commentPool = [...likers, ...friends];
    let t = day.created + rng.int(2, 90) * MIN;
    const themeComments = THEME[day.theme].comments;
    for (let k = 0; k < commentN && commentPool.length; k++) {
      const v = rng.pick(commentPool);
      t = t + expo(3 * HOUR);
      if (t > NOW - MIN) break;
      if (t < v.joined) continue;
      day.comments.push({ id: newId(), user: v, body: rng.chance(0.68) ? rng.pick(themeComments) : rng.pick(C.GENERIC_COMMENTS), at: t });
      notify(a, t, { type: 'comment', fromUid: v.uid, fromNickname: nickAt(v, t), dayId: day.id, dayTitle: day.title });
      if (rng.chance(0.3)) {
        t = t + rng.int(3, 240) * MIN;
        if (t > NOW - MIN) break;
        day.comments.push({ id: newId(), user: a, body: rng.pick(C.AUTHOR_REPLIES), at: t });
      }
    }
    // 태그 알림
    for (const uid of day.tagged) {
      const v = byUid.get(uid);
      notify(v, day.created + MIN, { type: 'tag', fromUid: a.uid, fromNickname: nickAt(a, day.created), dayId: day.id, dayTitle: day.title }, `tag_${day.id}_${a.uid}`);
    }
  }

  // 스팸 계정: 공개 글에 광고 댓글(일부는 신고됨)
  const spam = role.spam;
  const spamTargets = rng.sample(allDays.filter((d) => d.vis === 'public' && d.feed && d.status === 'confirmed' && !d.deleted && d.created > spam.joined), 40);
  const spamLines = ['[이벤트] 지금 바로 확인하세요 👉 프로필 링크', '선착순 100명 무료 증정 🎁 프로필 확인!', '하루 10분 투자로 월 300 🔥 DM 주세요', '축하드립니다! 경품 당첨되셨어요 프로필 링크 확인'];
  spam.reportedComments = [];
  for (const d of spamTargets) {
    if (d.author.blocked.has(spam.uid) && d.author.blocked.get(spam.uid).at < d.created) continue;
    const at = clampNow(d.created + rng.int(5, 600) * MIN, spam.joined);
    if (at <= d.created) continue;
    const c = { id: newId(), user: spam, body: rng.pick(spamLines), at };
    d.comments.push(c);
    if (rng.chance(0.35)) spam.reportedComments.push({ day: d, comment: c });
  }
}

// ---------------------------------------------------------------------------
// 펫 · 편지
// ---------------------------------------------------------------------------
const RULES = DEFAULT_PET_RULES;
const letters = [];
const summons = new Map(); // `${asked}|${requester}` -> {asked, requester, created, handled}
const WAIT_WEIGHTS = [[5, 5], [15, 8], [30, 12], [60, 20], [180, 18], [360, 12], [720, 10], [1440, 15]];

function makePet(owner, opt = {}) {
  const used = new Set(owner.pets.map((p) => p.name));
  const name = opt.name || rng.pick(C.PET_NAMES.filter((n) => !used.has(n))) || `펫${owner.pets.length + 1}`;
  const pet = {
    id: newId(),
    owner,
    species: opt.species || rng.weighted(SPECIES_WEIGHTS),
    personality: opt.personality || rng.pick(PERSONALITIES),
    sex: rng.pick(['male', 'female']),
    name,
    created: opt.created,
    legacy: !!opt.legacy,
    trips: [],
    stats: { deliveries: 0, damaged: 0, earlyReturns: 0, overstays: 0, recalls: 0, pettedByOthers: 0, snacksFromOthers: 0 },
  };
  owner.pets.push(pet);
  return pet;
}

function buildPets() {
  const showcaseSpec = new Map(SHOWCASE.map((s) => [s.nick, s]));
  for (const u of users) {
    if (u.noContent || u.key === 'spam') continue;
    const firstAt = clampNow(Math.max(u.joined + rng.int(5, 90) * MIN, PET_LAUNCH + rng.int(0, 20) * DAY + rng.int(0, 23) * HOUR), u.joined);
    if (u.key === 'me') {
      makePet(u, { species: 'dog', personality: 'hasty', name: '두부', created: PET_LAUNCH + 2 * HOUR });
      makePet(u, { species: 'cat', personality: 'easygoing', name: '나비', created: PET_LAUNCH + 21 * DAY });
      continue;
    }
    if (u.key === 'legacy') {
      makePet(u, { species: 'sparrow', personality: 'careful', name: '참새', created: PET_LAUNCH - 5 * DAY, legacy: true });
      continue;
    }
    const sc = showcaseSpec.get(u.nickname);
    if (sc) {
      // 편지 상대들은 기능이 생기자마자 펫을 받았다(과거 편지들이 펫보다 먼저 있으면 안 됨)
      makePet(u, { species: sc.species, personality: sc.personality, name: sc.pet, created: PET_LAUNCH + rng.int(0, 3) * DAY + rng.int(0, 23) * HOUR });
      continue;
    }
    if (u.key !== 'mission' && u.key !== 'heavy' && rng.chance(0.08)) continue; // 펫 화면을 아직 안 열어본 사람
    makePet(u, { created: firstAt, species: u.key === 'heavy' ? 'dog' : undefined, name: u.key === 'heavy' ? '보리' : undefined });
    const confirmed = u.days.filter((d) => d.status === 'confirmed' && !d.deleted).sort((a, b) => a.created - b.created);
    if (u.key !== 'mission' && confirmed.length >= 7 && rng.chance(0.65)) {
      const reached = Math.max(confirmed[6].created, firstAt + DAY);
      const at = clampNow(reached + rng.int(0, 12) * DAY + rng.int(0, 23) * HOUR, reached);
      if (at < NOW - HOUR) makePet(u, { created: at });
    }
  }
  // 편지를 주고받는 상대
  for (const u of users) {
    if (!u.pets.length) continue;
    if (u.key === 'me') {
      u.letterFriends = u.letterPartners;
      continue;
    }
    const fr = [...u.friends.keys()].map((id) => byUid.get(id)).filter((v) => !v.noContent && !blockedEither(u, v));
    u.letterFriends = rng.sample(fr, rng.int(1, 5));
  }
  // 내 편지 상대들은 나한테도 편지를 보낸다
  for (const p of role.me.letterPartners) if (!p.letterFriends.includes(role.me)) p.letterFriends.push(role.me);
}

function intimacyAt(pet, at) {
  const days = Math.max(0, (at - pet.created) / DAY);
  return Math.min(100, pet.stats.deliveries + Math.floor(days * pet.owner.care));
}

function rollCells(text, pet, at, force) {
  if (!text) return [];
  const cells = petLogic.rollDamageCells(text, pet.personality, intimacyAt(pet, at), force ? { ...RULES, minDamagePercent: 100, intimacyDamageReductionPerPoint: 0 } : RULES, rngFn);
  return cells;
}

/**
 * 편지 한 통(펫의 왕복 한 번)을 만든다. outcome을 안 주면 확률로 정한다.
 * 반환값의 end가 펫이 집에 돌아온 시각(진행 중이면 Infinity).
 */
function makeTrip(pet, to, start, spec = {}) {
  const owner = pet.owner;
  const kind = spec.kind || (to.letterFriends && to.letterFriends.includes(owner) && rng.chance(0.07) ? 'summon_response' : 'letter');
  const wait = spec.wait || rng.weighted(WAIT_WEIGHTS);
  const waitMs = wait * MIN;
  const deadline = start + waitMs;
  const beh = spec.behavior ? { behavior: spec.behavior, ratio: spec.behavior === 'early_return' ? 0.5 + rng.next() * 0.3 : null } : petLogic.rollBehavior(pet.personality, RULES, rngFn);
  let autoReturn = beh.behavior === 'overstay' ? null : beh.behavior === 'early_return' ? start + Math.round(waitMs * beh.ratio) : deadline;

  const pair = spec.pair || (rng.chance(0.02) ? [C.LONG_LETTER, '길게 써 줘서 고마워 ㅠㅠ 나도 진짜 보고 싶다. 이번 주말에 그 집 가자!'] : rng.pick(C.LETTER_PAIRS));
  const body = kind === 'summon_response' ? '' : pair[0];
  const replyBody = kind === 'summon_response' ? rng.pick(C.LETTER_PAIRS)[0] : pair[1];

  // 결과 정하기
  let outcome = spec.outcome;
  let replyAt = null;
  let recallAt = null;
  if (!outcome) {
    const replyP = kind === 'summon_response' ? 0.95 : owner.key === 'me' || to.key === 'me' ? 0.72 : 0.66;
    const willReply = rng.chance(replyP);
    const willRecall = rng.chance(0.06);
    let replyCand = willReply ? start + waitMs * (0.03 + rng.next() * 0.94) : Infinity;
    if (beh.behavior === 'overstay' && willReply && rng.chance(0.4)) replyCand = deadline + rng.int(30, 30 * 60) * MIN;
    const recallCand = willRecall ? start + waitMs * (0.1 + rng.next() * 0.6) : Infinity;
    let overstayEnd = Infinity;
    if (beh.behavior === 'overstay' && !willReply && !willRecall) {
      // 계속 머물다가 결국 답장을 받거나 주인이 부른다
      if (rng.chance(0.7)) replyCand = deadline + rng.int(60, 48 * 60) * MIN;
      else overstayEnd = deadline + rng.int(60, 72 * 60) * MIN;
    }
    const limit = autoReturn ?? Infinity;
    const events = [
      ['replied', replyCand < limit ? replyCand : Infinity],
      ['recalled', Math.min(recallCand < limit ? recallCand : Infinity, overstayEnd)],
      [beh.behavior === 'early_return' ? 'early' : 'expired', autoReturn ?? Infinity],
    ].sort((a, b) => a[1] - b[1]);
    outcome = events[0][0];
    const endCand = events[0][1];
    if (outcome === 'replied') replyAt = endCand;
    if (outcome === 'recalled') recallAt = endCand;
    if (endCand > NOW - MIN) outcome = 'ongoing';
  } else if (outcome === 'replied') {
    replyAt = start + (spec.replyAfter ?? waitMs * (0.05 + rng.next() * 0.8));
  } else if (outcome === 'recalled') {
    recallAt = start + (spec.recallAfter ?? waitMs * 0.3);
  }

  let end;
  let status;
  let returnReason;
  if (outcome === 'ongoing') {
    end = Infinity;
    status = 'awaiting_reply';
  } else if (outcome === 'replied') {
    end = replyAt;
    status = 'replied';
  } else if (outcome === 'recalled') {
    end = recallAt;
    status = 'recalled';
  } else {
    end = autoReturn;
    status = 'expired';
    returnReason = outcome === 'early' ? 'early' : 'timeout';
  }

  // 직접 정한 손상 칸도 실제 서버처럼 "글자가 있는 칸"만 남긴다
  const validCells = (text, cells) => {
    const ok = new Set(petLogic.damageCandidateCells(text));
    return cells.filter((c) => ok.has(c));
  };
  const outCells = spec.outCells !== undefined ? validCells(body, spec.outCells) : rollCells(body, pet, start, spec.forceDamage);
  const replyCells =
    status === 'replied' ? (spec.replyCells !== undefined ? validCells(replyBody, spec.replyCells) : rollCells(replyBody, pet, replyAt, false)) : [];
  const trip = {
    id: newId(),
    pet,
    owner,
    to,
    kind,
    start,
    wait,
    deadline,
    autoReturn,
    behavior: beh.behavior,
    body,
    replyBody,
    status,
    returnReason,
    replyAt,
    recallAt,
    end,
    outCells,
    replyCells,
    visitor: end - start > 10 * MIN ? { petted: spec.visitorPetted ?? rng.chance(0.25), snacked: spec.visitorSnacked ?? rng.chance(0.15) } : {},
    outboundReask: outCells.length && spec.reask !== false && rng.chance(0.45) ? clampNow(start + rng.int(2, 180) * MIN, start) : null,
    replyReask: replyCells.length && rng.chance(0.45) ? clampNow(replyAt + rng.int(2, 180) * MIN, replyAt) : null,
  };
  if (spec.reask === true && outCells.length) trip.outboundReask = clampNow(start + rng.int(2, 60) * MIN, start);
  if (spec.reask === false) trip.outboundReask = null;
  if (kind === 'summon_response') {
    const key = `${owner.uid}|${to.uid}`;
    const created = spec.summonedAt ?? start - rng.int(5, 4 * 60) * MIN;
    const prev = summons.get(key);
    if (!prev || prev.created < created) summons.set(key, { asked: owner, requester: to, created, handled: start });
  }
  pet.trips.push(trip);
  letters.push(trip);
  return trip;
}

function planPetTrips(pet, forced) {
  const owner = pet.owner;
  const fixed = forced.slice().sort((a, b) => a.start - b.start);
  const final = fixed.find((f) => f.final);
  const busy = []; // [start, end] — 강제로 넣은 편지가 차지하는 시간
  for (const f of fixed) {
    if (f.final) continue;
    const trip = makeTrip(pet, f.to, f.start, f);
    busy.push([trip.start - 30 * MIN, trip.end + 30 * MIN]);
  }
  if (owner.letterGap && owner.letterFriends.length) {
    const horizon = final ? final.start - 30 * MIN : NOW;
    let t = pet.created + rng.int(1, 72) * HOUR;
    let guard = 0;
    while (t < horizon && guard++ < 400) {
      const clash = busy.find(([s, e]) => t >= s - 2 * HOUR && t <= e);
      if (clash) {
        t = clash[1] + rng.int(1, 12) * HOUR;
        continue;
      }
      const choices = owner.letterFriends.filter((v) => owner.friends.get(v.uid)?.since <= t);
      if (!choices.length) {
        t += 3 * DAY;
        continue;
      }
      const to = rng.pick(choices);
      const before = pet.trips.length;
      const trip = makeTrip(pet, to, t, {});
      const nextBusy = busy.find(([s]) => s > t);
      if ((nextBusy && trip.end >= nextBusy[0]) || (final && trip.end >= final.start - 10 * MIN) || (trip.end === Infinity && final)) {
        // 다음 강제 편지와 겹치면 이번 것은 취소하고 그 뒤로 넘긴다
        pet.trips.splice(before, 1);
        letters.pop();
        if (trip.kind === 'summon_response') summons.delete(`${owner.uid}|${to.uid}`);
        t = (nextBusy && trip.end >= nextBusy[0] ? nextBusy[1] : horizon) + rng.int(1, 12) * HOUR;
        continue;
      }
      if (trip.end === Infinity) break;
      t = trip.end + Math.max(10 * MIN, expo(owner.letterGap));
    }
  }
  if (final) makeTrip(pet, final.to, final.start, final);
  pet.trips.sort((a, b) => a.start - b.start);
  // 진행 중인 편지는 맨 마지막 한 통만 있어야 한다
  const ongoing = pet.trips.filter((tr) => tr.end === Infinity);
  for (const tr of ongoing.slice(0, -1)) {
    tr.status = 'recalled';
    tr.recallAt = tr.end = clampNow(tr.start + 30 * MIN, tr.start);
  }
}

function buildLetters() {
  const me = role.me;
  const find = (nick) => users.find((u) => u.nickname === nick);
  const [dubu, nabi] = me.pets;
  const minji = find('민지');
  const seojun = find('서준');
  const hayun = find('하윤');
  const forcedByPet = new Map();
  const force = (pet, spec) => {
    if (!pet) return;
    if (!forcedByPet.has(pet)) forcedByPet.set(pet, []);
    // 직접 정한 편지는 종류도 고정(안 그러면 확률로 "펫 보내줘 응답"이 돼서 본문이 사라짐)
    forcedByPet.get(pet).push({ kind: 'letter', ...spec });
  };
  const pair = (needle) => C.LETTER_PAIRS.find((p) => p[0].includes(needle));

  // 지금 진행 중인 상황들(로그인해서 바로 눌러볼 수 있게)
  force(dubu, { final: true, to: minji, start: NOW - 40 * MIN, wait: 1440, behavior: 'normal', outcome: 'ongoing', pair: pair('퇴근했어?'), outCells: [] });
  force(minji?.pets[0], { final: true, to: me, start: NOW - 12 * MIN, wait: 180, behavior: 'normal', outcome: 'ongoing', pair: pair('같이 산책할래'), outCells: [1, 4], reask: false, visitorPetted: false, visitorSnacked: false });
  force(seojun?.pets[0], { final: true, to: me, start: NOW - 26 * HOUR, wait: 60, behavior: 'overstay', outcome: 'ongoing', pair: pair('영화 보러 가자'), outCells: [], visitorPetted: true, visitorSnacked: false });
  force(hayun?.pets[0], { final: true, to: me, kind: 'summon_response', start: NOW - 30 * MIN, wait: 360, behavior: 'normal', outcome: 'ongoing', summonedAt: NOW - 70 * MIN });

  // 손상 표현 14종을 다 보도록: 편지 상대마다 손상된 편지 한 통씩(과거)
  SHOWCASE.forEach((s, i) => {
    const u = find(s.nick);
    if (!u || !u.pets[0]) return;
    const start = NOW - (3 + i * 3.5) * DAY - rng.int(0, 10) * HOUR;
    const p = rng.pick(C.LETTER_PAIRS.filter((x) => x[0].length >= 12));
    force(u.pets[0], { to: me, start, wait: rng.pick([60, 180, 360]), behavior: 'normal', outcome: rng.chance(0.7) ? 'replied' : 'expired', pair: p, forceDamage: true, reask: i % 3 === 0 });
  });
  // 내가 보낸 편지가 돌아오는 길에 손상된 경우(답장 손상)
  force(nabi, { to: find('예린'), start: NOW - 9 * DAY, wait: 360, behavior: 'normal', outcome: 'replied', replyAfter: 2 * HOUR, pair: pair('추천해 준 책'), replyCells: [0, 2, 5] });
  // 서두르는 두부가 기다리다 먼저 돌아온 편지
  force(dubu, { to: find('도윤'), start: NOW - 5 * DAY, wait: 720, behavior: 'early_return', outcome: 'early', pair: pair('저녁에 치맥') });
  // 회수한 편지
  force(dubu, { to: find('시우'), start: NOW - 11 * DAY, wait: 1440, behavior: 'normal', outcome: 'recalled', recallAfter: 3 * HOUR, pair: pair('시간 될 때 전화') });
  // 긴 편지
  force(find('유나')?.pets[0], { to: me, start: NOW - 16 * DAY, wait: 1440, behavior: 'normal', outcome: 'replied', replyAfter: 9 * HOUR, pair: [C.LONG_LETTER, '이거 읽고 울었잖아 ㅠㅠ 이번 주에 무조건 보자. 그 집 내가 예약할게!'], outCells: [] });

  for (const u of users) for (const pet of u.pets) if (!pet.legacy) planPetTrips(pet, forcedByPet.get(pet) || []);

  // 펫 보내줘: 지금 기다리는 호출 2건 + 12시간 지나서 안 보이는 호출 1건
  const pending = [
    [find('도윤'), NOW - 25 * MIN],
    [find('예린'), NOW - 3 * HOUR],
    [find('시우'), NOW - 20 * HOUR],
  ];
  for (const [req, at] of pending) if (req) summons.set(`${me.uid}|${req.uid}`, { asked: me, requester: req, created: at, handled: null });
  // 다른 사람들 사이의 호출 몇 건
  for (const u of rng.sample(users.filter((x) => x.pets.length && x.letterFriends.length && x !== me), 20)) {
    const req = rng.pick(u.letterFriends);
    const key = `${u.uid}|${req.uid}`;
    if (!summons.has(key)) summons.set(key, { asked: u, requester: req, created: NOW - rng.int(10, 30 * 60) * MIN, handled: null });
  }
}

function legacyLetter() {
  const me = role.me;
  const old = role.legacy;
  const pet = old.pets[0];
  const created = PET_LAUNCH - 3 * DAY;
  const id = newId();
  put(`letters/${id}`, {
    fromUid: old.uid,
    fromNickname: old.nickname,
    fromPhotoURL: old.photoURL,
    fromPetId: pet.id,
    fromPetSpecies: 'sparrow',
    fromPetName: pet.name,
    toUid: me.uid,
    toNickname: me.nickname,
    toPhotoURL: me.photoURL,
    body: '요즘도 일기 쓰지? 예전 앱 쓸 때 보낸 편지야. 잘 지내!',
    waitHours: 24,
    replyDeadline: ts(created + 24 * HOUR),
    outboundDamage: 'none',
    status: 'replied',
    createdAt: ts(created),
    repliedAt: ts(created + 5 * HOUR),
    expiredAt: null,
  });
  put(`letters/${id}/reply/main`, { body: '응 덕분에 잘 지내! 오랜만이다 ㅎㅎ', damage: 'none', createdAt: ts(created + 5 * HOUR) });
}

function finishPets() {
  for (const u of users) {
    for (const pet of u.pets) {
      if (pet.legacy) continue;
      for (const tr of pet.trips) {
        if (tr.end !== Infinity) {
          pet.stats.deliveries++;
          if (tr.returnReason === 'early') pet.stats.earlyReturns++;
          if (tr.status === 'recalled') pet.stats.recalls++;
        }
        if (tr.behavior === 'overstay' && (tr.end === Infinity ? NOW : tr.end) > tr.deadline) pet.stats.overstays++;
        if (tr.outCells.length) pet.stats.damaged++;
        if (tr.replyCells.length) pet.stats.damaged++;
        if (tr.visitor.petted) pet.stats.pettedByOthers++;
        if (tr.visitor.snacked) pet.stats.snacksFromOthers++;
      }
      const days = Math.max(0, (NOW - pet.created) / DAY);
      pet.stats.ownerPets = Math.floor(days * u.care * 0.55);
      pet.stats.ownerSnacks = Math.floor(days * u.care * 0.45);
      pet.intimacy = Math.min(100, pet.stats.deliveries + pet.stats.ownerPets + pet.stats.ownerSnacks);
      const last = pet.trips[pet.trips.length - 1];
      pet.away = last && last.end === Infinity ? last : null;
      const petted = u.key === 'me' ? false : rng.chance(0.3);
      const snacked = u.key === 'me' ? pet.name === '나비' : rng.chance(0.2);
      const deliveryGains = Math.min(3, pet.trips.filter((tr) => tr.end !== Infinity && kstLabel(tr.end) === TODAY).length);
      pet.daily = { day: TODAY, deliveryGains, petted, snacked, total: Math.min(5, deliveryGains + (petted ? 1 : 0) + (snacked ? 1 : 0)) };
    }
  }
}

// ---------------------------------------------------------------------------
// 문서로 옮기기
// ---------------------------------------------------------------------------
function emitDocs() {
  const me = role.me;
  for (const u of users) {
    const confirmed = u.days.filter((d) => d.status === 'confirmed' && !d.deleted).length;
    const profile = {
      uid: u.uid,
      nickname: u.nickname,
      photoURL: u.photoURL,
      bio: u.bio,
      dayCount: confirmed,
      locale: u.locale,
      createdAt: ts(u.joined),
    };
    if (u.pets.length) profile.petCount = u.pets.length;
    if (u.consent) profile.consentedAt = ts(u.joined + 2 * MIN);
    if (u.notificationSettings) profile.notificationSettings = u.notificationSettings;
    put(`users/${u.uid}`, profile);
    if (u.email) put(`usersByEmail/${u.email.toLowerCase()}`, { uid: u.uid });
    for (const g of u.groups) put(`users/${u.uid}/groups/${g.id}`, { name: g.name, order: g.order, createdAt: ts(g.created) });
    for (const [fid, f] of u.friends) {
      const fu = byUid.get(fid);
      put(`users/${u.uid}/friends/${fid}`, {
        friendUid: fid,
        nickname: nickAt(fu, f.since),
        photoURL: fu.photoURL,
        groupId: f.groupId,
        groupName: f.groupName,
        createdAt: ts(f.since),
      });
    }
    for (const [bid, b] of u.blocked) put(`users/${u.uid}/blocked/${bid}`, { blockedUid: bid, blockedNickname: b.nickname, createdAt: ts(b.at) });
    for (const pet of u.pets) {
      const doc = {
        species: pet.species,
        personality: pet.personality,
        sex: pet.sex,
        name: pet.name,
        status: pet.away ? 'away' : 'idle',
        currentLetterId: pet.away ? pet.away.id : null,
        createdAt: ts(pet.created),
      };
      if (!pet.legacy) Object.assign(doc, { intimacy: pet.intimacy, daily: pet.daily, stats: pet.stats });
      put(`users/${u.uid}/pets/${pet.id}`, doc);
    }
  }

  // DAY · 좋아요 · 댓글
  for (const d of allDays) {
    const a = d.author;
    d.likes.sort((x, y) => x.at - y.at);
    d.comments.sort((x, y) => x.at - y.at);
    put(`days/${d.id}`, {
      authorId: a.uid,
      authorNickname: nickAt(a, d.created),
      authorPhotoURL: a.photoURL,
      date: ts(kstMidnightMs(d.label)),
      dateLabel: d.label,
      title: d.title,
      contentBlocks: d.blocks,
      photoURLs: d.photos.map((p) => p.path),
      photoAspects: d.photos.map((p) => p.aspect),
      visibility: d.vis,
      groupId: d.groupId,
      taggedFriendUids: d.tagged,
      taggedFriendNicknames: d.tagged.map((uid) => nickAt(byUid.get(uid), d.created)),
      moodTag: d.mood,
      location: d.location,
      fontKey: d.font,
      textAlign: d.align,
      likeCount: d.likes.length,
      commentCount: d.comments.length,
      editCount: d.editCount,
      inWorldFeed: d.feed,
      inHistory: d.history,
      status: d.status,
      createdAt: ts(d.created),
      updatedAt: ts(d.updated),
      deleted: d.deleted,
    });
    for (const l of d.likes) {
      put(`days/${d.id}/likes/${l.uid}`, { uid: l.uid, createdAt: ts(l.at) });
      put(`users/${l.uid}/myLikes/${d.id}`, { dayId: d.id, createdAt: ts(l.at) });
    }
    for (const c of d.comments) {
      put(`days/${d.id}/comments/${c.id}`, { authorId: c.user.uid, authorNickname: nickAt(c.user, c.at), authorPhotoURL: c.user.photoURL, body: c.body, createdAt: ts(c.at) });
      put(`users/${c.user.uid}/myComments/${c.id}`, { commentId: c.id, dayId: d.id, dayTitle: d.title, body: c.body, createdAt: ts(c.at) });
    }
  }

  // 내 연혁에 추가한 태그된 DAY
  for (const d of me.taggedIn) {
    if (rng.chance(0.6)) put(`users/${me.uid}/historyLinks/${d.id}`, { dayId: d.id, authorId: d.author.uid, addedAt: ts(clampNow(d.created + rng.int(5, 600) * MIN, d.created)) });
  }

  // 편지 · 답장
  for (const tr of letters) {
    const from = tr.owner;
    const to = tr.to;
    const doc = {
      kind: tr.kind,
      fromUid: from.uid,
      fromNickname: nickAt(from, tr.start),
      fromPhotoURL: from.photoURL,
      fromPetId: tr.pet.id,
      fromPetSpecies: tr.pet.species,
      fromPetName: tr.pet.name,
      toUid: to.uid,
      toNickname: nickAt(to, tr.start),
      toPhotoURL: to.photoURL,
      body: tr.body,
      waitMinutes: tr.wait,
      replyDeadline: ts(tr.deadline),
      autoReturnAt: tr.autoReturn == null ? null : ts(tr.autoReturn),
      behavior: tr.behavior,
      outboundDamage: tr.outCells.length ? 'cells' : 'none',
      outboundDamageCells: tr.outCells,
      overstayNotified: tr.behavior === 'overstay' && (tr.end === Infinity ? NOW : tr.end) > tr.deadline,
      status: tr.status,
      createdAt: ts(tr.start),
      repliedAt: tr.status === 'replied' ? ts(tr.replyAt) : null,
      expiredAt: tr.status === 'expired' ? ts(tr.end) : null,
    };
    if (tr.returnReason) doc.returnReason = tr.returnReason;
    if (tr.status === 'recalled') doc.recalledAt = ts(tr.recallAt);
    if (tr.outboundReask) doc.outboundReaskedAt = ts(tr.outboundReask);
    if (tr.replyReask) doc.replyReaskedAt = ts(tr.replyReask);
    if (tr.visitor.petted || tr.visitor.snacked) doc.visitor = { ...(tr.visitor.petted ? { petted: true } : {}), ...(tr.visitor.snacked ? { snacked: true } : {}) };
    if (tr.status === 'replied') {
      const reply = { body: tr.replyBody, damage: tr.replyCells.length ? 'cells' : 'none', damageCells: tr.replyCells, createdAt: ts(tr.replyAt) };
      doc.reply = reply;
      put(`letters/${tr.id}/reply/main`, reply);
    }
    put(`letters/${tr.id}`, doc);

    // 편지 알림
    const pn = tr.pet.name;
    if (tr.kind === 'summon_response') {
      notify(to, tr.start + 5 * 1000, { type: 'summon_accepted', fromUid: from.uid, fromNickname: nickAt(from, tr.start), letterId: tr.id, petName: pn });
    } else {
      notify(to, tr.start + 5 * 1000, { type: 'letter_received', fromUid: from.uid, fromNickname: nickAt(from, tr.start), letterId: tr.id, petName: pn });
    }
    if (tr.status === 'replied') notify(from, tr.replyAt + 5 * 1000, { type: 'letter_replied', fromUid: to.uid, fromNickname: nickAt(to, tr.replyAt), letterId: tr.id, petName: pn });
    if (tr.status === 'expired') notify(from, tr.end + 30 * 1000, { type: tr.returnReason === 'early' ? 'pet_early_return' : 'letter_expired', fromUid: to.uid, fromNickname: nickAt(to, tr.end), letterId: tr.id, petName: pn });
    if (doc.overstayNotified) notify(from, tr.deadline + 40 * 1000, { type: 'pet_overstay', fromUid: to.uid, fromNickname: nickAt(to, tr.deadline), letterId: tr.id, petName: pn });
    if (tr.outboundReask) notify(from, tr.outboundReask, { type: 'letter_reask', fromUid: to.uid, fromNickname: nickAt(to, tr.outboundReask), letterId: tr.id, part: 'outbound' });
    if (tr.replyReask) notify(to, tr.replyReask, { type: 'letter_reask', fromUid: from.uid, fromNickname: nickAt(from, tr.replyReask), letterId: tr.id, part: 'reply' });
  }
  legacyLetter();

  // 펫 보내줘(호출)
  for (const s of summons.values()) {
    const doc = { fromUid: s.requester.uid, fromNickname: nickAt(s.requester, s.created), fromPhotoURL: s.requester.photoURL, createdAt: ts(s.created) };
    if (s.handled) doc.handledAt = ts(s.handled);
    put(`users/${s.asked.uid}/incomingSummons/${s.requester.uid}`, doc);
    notify(s.asked, s.created, { type: 'pet_summon', fromUid: s.requester.uid, fromNickname: nickAt(s.requester, s.created) });
  }

  // 친구 요청(대기 중) · 친구 수락 알림
  const regulars = users.filter((u) => !u.key && !u.noContent);
  const requests = [];
  const notFriends = (a, b) => a !== b && !a.friends.has(b.uid) && !blockedEither(a, b);
  for (const from of rng.sample(regulars.filter((u) => notFriends(u, me)), 3)) requests.push([from, me, NOW - rng.int(20, 70 * 60) * MIN]);
  for (const to of rng.sample(regulars.filter((u) => notFriends(me, u)), 2)) requests.push([me, to, NOW - rng.int(1, 4) * DAY]);
  for (let k = 0; k < 30; k++) {
    const a = rng.pick(regulars);
    const b = rng.pick(regulars);
    if (notFriends(a, b)) requests.push([a, b, NOW - rng.int(1, 14 * 24) * HOUR]);
  }
  const seenReq = new Set();
  for (const [from, to, at] of requests) {
    const key = `${to.uid}|${from.uid}`;
    if (seenReq.has(key) || seenReq.has(`${from.uid}|${to.uid}`)) continue;
    seenReq.add(key);
    const g = from.groups.find((x) => x.name === '친구');
    put(`users/${to.uid}/friendRequests/${from.uid}`, { fromUid: from.uid, fromNickname: from.nickname, fromPhotoURL: from.photoURL, groupId: g.id, groupName: g.name, createdAt: ts(at) });
    notify(to, at, { type: 'friend_request', fromUid: from.uid, fromNickname: from.nickname });
  }
  for (const u of users) {
    for (const [fid, f] of u.friends) {
      if (u.uid < fid) {
        const other = byUid.get(fid);
        const [requester, accepter] = rng.chance(0.5) ? [u, other] : [other, u];
        notify(requester, f.since, { type: 'friend_accept', fromUid: accepter.uid, fromNickname: nickAt(accepter, f.since) });
      }
    }
  }

  // 회고 알림(1년 전 오늘)
  const morning = kstMidnightMs(TODAY) + 5 * MIN;
  if (NOW > morning) {
    const [y, m, dd] = TODAY.split('-');
    const yearAgo = `${Number(y) - 1}-${m}-${dd}`;
    for (const d of allDays) {
      if (d.label === yearAgo && d.status === 'confirmed' && !d.deleted && d.history) {
        notify(d.author, morning, { type: 'memory', fromUid: d.author.uid, fromNickname: d.author.nickname, dayId: d.id, dayTitle: d.title, yearsAgo: 1 });
      }
    }
  }

  // 신고
  for (const { day, comment } of role.spam.reportedComments) {
    const reporter = day.author;
    put(`reports/${newId()}`, { reporterUid: reporter.uid, targetType: 'comment', targetId: comment.id, targetAuthorUid: role.spam.uid, reason: 'spam', detail: '광고 댓글이에요', createdAt: ts(clampNow(comment.at + rng.int(5, 300) * MIN, comment.at)) });
  }
  put(`reports/${newId()}`, { reporterUid: me.uid, targetType: 'user', targetId: role.spam.uid, targetAuthorUid: role.spam.uid, reason: 'spam', detail: '계속 광고 댓글을 달아요', createdAt: ts(NOW - 4 * DAY - HOUR) });

  // 운영 설정값(에뮬레이터에서 숫자를 바꿔보며 테스트할 수 있게)
  put('config/petRules', JSON.parse(JSON.stringify(RULES)));

  // 알림
  for (const n of notifications) put(`users/${n.to.uid}/notifications/${n.id}`, n.data);
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------
async function downloadPhotos() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const buffers = new Map();
  const ids = [...usedPhotoIds];
  let failed = 0;
  await pool(ids, 12, async (pid) => {
    const aspect = aspectOf(pid);
    const file = path.join(CACHE_DIR, `${pid}-${aspect}.jpg`);
    if (!fs.existsSync(file)) {
      const [w, h] = aspect === 'landscape' ? [800, 600] : aspect === 'portrait' ? [600, 800] : [720, 720];
      try {
        const res = await fetch(`https://images.unsplash.com/photo-${pid}?w=${w}&h=${h}&fit=crop&crop=entropy&q=62&fm=jpg`, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(String(res.status));
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      } catch {
        failed++;
        return;
      }
    }
    buffers.set(pid, fs.readFileSync(file));
  });
  return { buffers, failed };
}

/** 만든 데이터가 실제 앱 규칙과 어긋나지 않는지 스스로 검사한다(문제 목록 반환). */
function validate() {
  const problems = [];
  const bad = (msg) => problems.push(msg);
  for (const u of users) {
    for (const pet of u.pets) {
      if (pet.legacy) continue;
      const trips = pet.trips;
      trips.forEach((tr, i) => {
        const who = `${u.nickname}의 ${pet.name}→${tr.to.nickname}`;
        if (tr.start < pet.created) bad(`${who}: 펫이 생기기 전에 보낸 편지`);
        if (tr.start > NOW) bad(`${who}: 미래에 보낸 편지`);
        if (tr.end !== Infinity && tr.end > NOW) bad(`${who}: 미래에 끝난 편지`);
        if (i + 1 < trips.length && tr.end > trips[i + 1].start) bad(`${who}: 다음 편지와 시간이 겹침`);
        if (tr.status === 'replied' && !(tr.replyAt > tr.start)) bad(`${who}: 답장 시각 이상`);
        if (tr.status === 'awaiting_reply' && i !== trips.length - 1) bad(`${who}: 진행 중인 편지가 마지막이 아님`);
        const f = u.friends.get(tr.to.uid);
        if (!f) bad(`${who}: 친구가 아닌 사람에게 편지`);
        else if (f.since > tr.start) bad(`${who}: 친구가 되기 전에 보낸 편지`);
        if (blockedEither(u, tr.to)) bad(`${who}: 차단 관계인데 편지`);
        if (tr.body.length > 2000 || tr.replyBody.length > 2000) bad(`${who}: 편지가 2000자 초과`);
      });
    }
  }
  for (const d of allDays) {
    const who = `DAY ${d.author.nickname} ${d.label} "${d.title}"`;
    if (d.created > NOW) bad(`${who}: 미래에 작성됨`);
    if (d.status === 'confirmed' && d.label > TODAY) bad(`${who}: 미래 날짜인데 확정됨`);
    if (d.title.length > 40) bad(`${who}: 제목 40자 초과`);
    if (d.tagged.length > 20) bad(`${who}: 태그 20명 초과`);
    if (d.blocks.length > 50) bad(`${who}: 블록 50개 초과`);
    if (d.photos.length !== d.blocks.filter((b) => b.type === 'photo').length) bad(`${who}: 사진 블록 수 불일치`);
    for (const l of d.likes) if (l.at < d.created || l.at > NOW) bad(`${who}: 좋아요 시각 이상`);
    for (const c of d.comments) if (c.at < d.created || c.at > NOW || c.body.length > 500) bad(`${who}: 댓글 이상`);
  }
  for (const u of users) {
    if (u.nickname.length > 30) bad(`${u.nickname}: 닉네임 30자 초과`);
    if ((u.bio || '').length > 200) bad(`${u.nickname}: 소개 200자 초과`);
    if (u.pets.length > 2) bad(`${u.nickname}: 펫 3마리 이상`);
  }
  const missionDays = role.mission.days.filter((d) => d.status === 'confirmed' && !d.deleted).length;
  if (missionDays < 7) bad(`미션왕 DAY ${missionDays}개(7개 이상이어야 함)`);
  return problems;
}

function printSummary(t0, photoSummary) {
  const count = (fn) => allDays.filter(fn).length;
  const likes = allDays.reduce((s, d) => s + d.likes.length, 0);
  const comments = allDays.reduce((s, d) => s + d.comments.length, 0);
  const pets = users.reduce((s, u) => s + u.pets.length, 0);
  const friendships = users.reduce((s, u) => s + u.friends.size, 0) / 2;
  const byStatus = letters.reduce((m, l) => ((m[l.status] = (m[l.status] || 0) + 1), m), {});
  console.log(`\n완료! (${Math.round((Date.now() - t0) / 1000)}초)`);
  console.log(`  사람 ${users.length} · 친구 관계 ${friendships} · 문서 ${docs.length.toLocaleString()}`);
  console.log(`  DAY ${allDays.length.toLocaleString()} (오늘 ${count((d) => d.label === TODAY && d.status === 'confirmed')} · 예정 ${count((d) => d.status === 'draft')} · 삭제 ${count((d) => d.deleted)})`);
  console.log(`  좋아요 ${likes.toLocaleString()} · 댓글 ${comments.toLocaleString()} · 알림 ${notifications.length.toLocaleString()}`);
  console.log(`  펫 ${pets} · 편지 ${letters.length.toLocaleString()} (답장 ${byStatus.replied || 0} · 시간 종료 ${byStatus.expired || 0} · 회수 ${byStatus.recalled || 0} · 진행 중 ${byStatus.awaiting_reply || 0})`);
  const me = role.me;
  const myNotis = notifications.filter((n) => n.to === me);
  console.log(
    `  지민 계정: DAY ${me.days.length} · 친구 ${me.friends.size} · 편지 ${letters.filter((l) => l.owner === me || l.to === me).length} · 알림 ${myNotis.length}(안 읽음 ${myNotis.filter((n) => !n.data.read).length})`
  );
  console.log(`  ${photoSummary}`);
  console.log(`\n로그인(비밀번호는 전부 ${PASSWORD})`);
  const show = [
    ['me@day.test', '지민 — 데이터가 제일 많은 메인 계정(편지·펫·알림·예정 DAY·태그·회고)'],
    ['minji@day.test', '민지 — 지금 콩이가 지민 곁에서 답장 기다리는 중(손상 편지)'],
    ['seojun@day.test', '서준 — 똘이가 지민 곁에 계속 머무는 중'],
    ['hayun@day.test', '하윤 — 펫 보내줘에 응답해서 삐약이를 보낸 상태'],
    ['doyun@day.test', '도윤 — 지민에게 펫 보내줘를 보낸 상태'],
    ['heavy@day.test', '루비맘 — 1년 넘게 매일 쓴 헤비 유저(목록 더보기 확인)'],
    ['mission@day.test', '미션왕 — 두 번째 펫 받을 수 있는 상태'],
    ['new@day.test', '새내기 — 방금 가입(빈 화면·첫 펫 고르기)'],
    ['unverified@day.test', '인증대기 — 이메일 인증 화면'],
    ['noconsent@day.test', '약관미동의 — 약관 동의 화면'],
    ['legacy@day.test', '옛날사람 — 개편 전 참새·예전 형식 편지'],
    ['en@day.test', 'Alex — 영어 설정 계정(좋아요·회고 알림 꺼 둠)'],
    ['blocker@day.test', '밤하늘 — 지민을 차단한 사람'],
    ['spam@day.test', '이벤트당첨안내 — 지민이 차단한 광고 계정(신고됨)'],
    ['user001@day.test ~', '그 밖의 보통 사용자들'],
  ];
  for (const [email, desc] of show) console.log(`  ${email.padEnd(20)} ${desc}`);
  console.log('');
}

async function main() {
  const t0 = Date.now();
  if (!DRY) {
    const need = [
      ['Firestore', `http://${HOST}:${PORT.firestore}/`],
      ['Auth', `http://${HOST}:${PORT.auth}/`],
    ];
    if (WITH_PHOTOS) need.push(['Storage', `http://${HOST}:${PORT.storage}/`]);
    for (const [name, url] of need) {
      if (!(await reachable(url))) {
        console.error(`\n${name} 에뮬레이터가 안 켜져 있어요. 먼저 다른 터미널에서 "npm run emu"를 실행해 주세요.\n`);
        process.exit(1);
      }
    }
    if (WITH_PHOTOS) assertLocalStorage();
    // 이미 데이터가 꽉 찬 에뮬레이터를 비우고 다시 쓰면 에뮬레이터가 몹시 느려진다
    // (실측: 새로 켠 에뮬레이터는 1분, 8만 개를 지우고 다시 쓰면 10분 넘게 걸리거나
    // 시간 초과). 그래서 기본은 멈추고 다시 켜라고 안내한다. --force면 그냥 진행.
    const existing = await db.collection('users').limit(1).get();
    if (!existing.empty && args.force !== 'true') {
      console.error(
        '\n에뮬레이터에 이미 데이터가 있어요. 지우고 다시 쓰면 10분 넘게 걸려서,' +
          '\n에뮬레이터 터미널에서 Ctrl+C로 끈 뒤 "npm run emu"로 다시 켜고 "npm run seed"를 해 주세요(1분이면 끝나요).' +
          '\n그래도 지금 그대로 하려면: npm run seed -- --force\n'
      );
      process.exit(1);
    }
  }

  console.log(`\n[1/5] 데이터 설계 중… (사람 ${USER_COUNT}명, seed ${SEED})`);
  buildPeople();
  buildFriendships();
  buildDays();
  buildEngagement();
  buildPets();
  buildLetters();
  finishPets();
  emitDocs();
  const problems = validate();
  if (problems.length) {
    console.warn(`\n검사에서 ${problems.length}건이 걸렸어요:`);
    for (const p of problems.slice(0, 40)) console.warn(`  - ${p}`);
    if (!DRY) process.exit(1);
  }
  if (DRY) {
    printSummary(t0, '드라이런 — 아무것도 쓰지 않았어요');
    return;
  }

  console.log('[2/5] 에뮬레이터 비우는 중…');
  const hubUp = await reachable(`http://${HOST}:${PORT.hub}/`);
  if (hubUp) await fetch(`http://${HOST}:${PORT.hub}/functions/disableBackgroundTriggers`, { method: 'PUT' }).catch(() => undefined);
  try {
    await fetch(`http://${HOST}:${PORT.firestore}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
    await fetch(`http://${HOST}:${PORT.auth}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
    if (WITH_PHOTOS) {
      assertLocalStorage();
      await bucket.deleteFiles({ force: true }).catch(() => undefined);
    }

    console.log(`[3/5] 계정 ${users.length}개 만드는 중…`);
    await pool(users, 10, async (u) => {
      const spec = { uid: u.uid, displayName: u.nickname, emailVerified: !!u.email && u.verified };
      if (u.email) Object.assign(spec, { email: u.email, password: PASSWORD });
      if (u.photoURL) spec.photoURL = u.photoURL;
      await auth.createUser(spec);
    });

    console.log(`[4/5] 문서 ${docs.length.toLocaleString()}개 쓰는 중…`);
    // 에뮬레이터는 한꺼번에 너무 몰아 쓰면 응답이 60초 넘게 밀려서(DEADLINE_EXCEEDED)
    // 죽는다 — 속도를 제한하고, 그래도 실패한 문서는 모아서 다시 쓴다.
    let pending = docs;
    let written = 0;
    for (let round = 1; pending.length && round <= 4; round++) {
      const failed = [];
      const writer = db.bulkWriter({ throttling: { initialOpsPerSecond: 2000, maxOpsPerSecond: 4000 } });
      writer.onWriteError((err) => err.failedAttempts < 3);
      for (const entry of pending) {
        writer
          .set(db.doc(entry[0]), entry[1])
          .then(() => {
            written++;
            if (written % 20000 === 0) console.log(`      ${written.toLocaleString()}개…`);
          })
          .catch(() => failed.push(entry));
      }
      await writer.close();
      if (failed.length) console.log(`      ${failed.length.toLocaleString()}개 실패 → 다시 쓰기(${round}회차)`);
      pending = failed;
    }
    if (pending.length) throw new Error(`문서 ${pending.length}개를 끝내 못 썼어요(에뮬레이터를 껐다 켜고 다시 해 주세요)`);

    let photoSummary = '사진 없음(--photos=false)';
    if (WITH_PHOTOS) {
      console.log(`[5/5] 사진 준비·업로드 중… (서로 다른 사진 ${usedPhotoIds.size}장)`);
      const { buffers, failed } = await downloadPhotos();
      const jobs = allDays.flatMap((d) => d.photos.filter((p) => buffers.has(p.pid)));
      await pool(jobs, 16, async (p) => {
        await bucket.file(p.path).save(buffers.get(p.pid), { resumable: false, contentType: 'image/jpeg', metadata: { contentType: 'image/jpeg' } });
      });
      photoSummary = `사진 ${jobs.length.toLocaleString()}장 업로드${failed ? ` (내려받기 실패 ${failed}장은 빈칸으로 보임)` : ''}`;
    }
    printSummary(t0, photoSummary);
  } finally {
    if (hubUp) await fetch(`http://${HOST}:${PORT.hub}/functions/enableBackgroundTriggers`, { method: 'PUT' }).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('\n생성 실패:', err);
  process.exit(1);
});
