import type { Timestamp } from '@firebase/firestore';

export type UserProfile = {
  uid: string;
  nickname: string;
  // 이메일은 여기 넣지 않는다. users/{uid} 문서는 닉네임/프로필사진을
  // 보여주려고 "로그인한 사람이면 누구나 읽기" 가능하게 열려있는데, 예전엔
  // 이메일도 같이 저장돼 있어서 다른 사람 uid만 알면 실제 이메일 주소를 볼
  // 수 있는 정보 노출이 있었다(친구 추가용 이메일 조회는 usersByEmail의
  // 별도 매핑으로 충분해서, 여기 저장할 필요 자체가 없었다).
  photoURL: string | null;
  bio: string;
  dayCount: number;
  /** 지금 갖고 있는 펫 수(constants/pets.ts의 MAX_PETS까지). 이 필드가
   * 없는 계정(이 기능 이전 가입자)은 아직 펫이 없는 것으로 취급하고,
   * pets.tsx 진입 시 그 자리에서 첫 펫을 지급한다(data/pets.ts의
   * grantStarterPet). */
  petCount?: number;
  /** 이 기기/브라우저로 로그인해서 얻은 Expo 푸시 토큰들(여러 기기 지원).
   * 서버(functions/index.js의 sendPushOnNotification)가 새 알림이 생길 때
   * 이 배열로 실제 푸시를 보낸다. */
  pushTokens?: string[];
  /** 알림 종류별로 푸시를 받을지 끌 수 있는 설정. 값이 없는 종류는 기본
   * true(받음)로 취급한다 — 그래야 이 필드가 생기기 전에 가입한 계정도
   * 계속 알림을 받는다. */
  notificationSettings?: Partial<NotificationSettings>;
  /** 이 계정이 마지막으로 쓴 실제 언어('시스템 설정' 같은 기기별 값이
   * 아니라 그걸 풀어낸 결과값). 클라이언트 화면 자체는 기기에 저장된 값을
   * 바로 쓰지만, 서버(sendPushOnNotification)는 기기 설정을 알 방법이
   * 없어서 실제 푸시 문구를 무슨 언어로 보낼지 여기 저장해둔 값을 본다. */
  locale?: 'ko' | 'en';
  /** 이용약관·개인정보처리방침에 동의한 시각. 없으면 아직 동의 전(가입
   * 직후 상태)이라, _layout.tsx가 ConsentGate로 막고 이 값을 채우기 전까지
   * 앱의 다른 화면을 못 쓰게 한다. 한 번 채워지면 다시 지우거나 바꿀 수
   * 없다(firestore.rules 참고) — 법적 동의 기록이라 사후 조작을 막아야
   * 한다. */
  consentedAt?: Timestamp | null;
  createdAt: Timestamp | null;
};

/** 알림 종류를 6개로 묶은 설정 카테고리. friend_request/friend_accept는
 * 사용자 입장에서 둘 다 "친구 관련 알림"이라 하나로 합쳤다. memory는
 * "회고 알림"(1년 전 오늘 등록한 DAY를 다시 보여주는 알림, 매일 자정
 * 서버에서 자동으로 확인해서 보낸다 — functions/index.js의
 * sendMemoryNotifications 참고)이다. letter는 편지 도착/답장/타임아웃/
 * 호출(pet_summon) 4종을 하나로 묶는다 — 전부 "펫 편지함" 관련 알림이라
 * 세부적으로 나눠 끄게 하면 설정 화면만 복잡해진다. */
export type NotificationSettings = {
  tag: boolean;
  comment: boolean;
  like: boolean;
  friend: boolean;
  memory: boolean;
  letter: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  tag: true,
  comment: true,
  like: true,
  friend: true,
  memory: true,
  letter: true,
};

export type FriendGroup = {
  id: string;
  name: string;
  order: number;
  createdAt: Timestamp | null;
};

export type FriendEntry = {
  friendUid: string;
  nickname: string;
  photoURL: string | null;
  groupId: string;
  groupName: string;
  createdAt: Timestamp | null;
};

/** users/{toUid}/friendRequests/{fromUid}. 받는 사람 쪽에만 존재하는
 * "대기 중" 요청 하나. 수락하면 양쪽 friends 서브컬렉션에 각자 문서가
 * 생기고 이 요청 문서는 지워진다. */
export type FriendRequest = {
  fromUid: string;
  fromNickname: string;
  fromPhotoURL: string | null;
  /** 보낸 사람이 자기 쪽에서 이 친구를 넣어둘 그룹(수락 시 보낸 사람의
   * friends 문서에 그대로 쓰인다). */
  groupId: string;
  groupName: string;
  createdAt: Timestamp | null;
};

/** users/{uid}/blocked/{blockedUid}. 차단한 사람은 나한테 새 친구요청·댓글을
 * 못 남기고(보안 규칙에서 확인), 월드데이 피드에서도 걸러진다(클라이언트에서
 * 제외). */
export type BlockedUser = {
  blockedUid: string;
  blockedNickname: string;
  createdAt: Timestamp | null;
};

export type ReportTargetType = 'day' | 'comment' | 'user';
export type ReportReason = 'spam' | 'abuse' | 'inappropriate' | 'other';

export type NotificationType =
  | 'tag'
  | 'comment'
  | 'like'
  | 'friend_request'
  | 'friend_accept'
  | 'memory'
  | 'letter_received'
  | 'letter_replied'
  | 'letter_expired'
  | 'pet_summon';

export type AppNotification = {
  id: string;
  type: NotificationType;
  fromUid: string;
  fromNickname: string;
  /** tag/comment/like/memory에서만 쓴다. friend_request/friend_accept는
   * 특정 DAY와 무관해서 비워둔다. */
  dayId?: string;
  dayTitle?: string;
  /** memory(회고 알림)에서만 쓴다 — 몇 년 전 오늘 쓴 DAY인지. */
  yearsAgo?: number;
  /** letter_received/letter_replied/letter_expired에서만 쓴다 — 눌렀을 때
   * 이동할 편지. pet_summon은 특정 편지와 무관해서(그냥 편지함으로
   * 이동) 비워둔다. */
  letterId?: string;
  read: boolean;
  createdAt: Timestamp | null;
};
