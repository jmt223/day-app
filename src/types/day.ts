import type { Timestamp } from '@firebase/firestore';

import type { FontPresetKey } from '@/constants/theme';
import type { PhotoAspectKey } from '@/constants/photo-aspect';

export type DayVisibility = 'public' | 'friends' | 'group' | 'private';

/** 본문은 텍스트와 사진이 섞인 블록 목록으로 저장한다(네이버 블로그처럼
 * 글 쓰다가 중간중간 사진을 끼워 넣는 일기장 형태). 사진 블록은 실제 파일을
 * 들고 있지 않고 photoURLs/photoAspects 배열의 인덱스만 가리킨다. */
export type ContentBlock = { type: 'text'; text: string } | { type: 'photo'; photoIndex: number };

export type MoodKey =
  | 'happy'
  | 'grateful'
  | 'excited'
  | 'calm'
  | 'proud'
  | 'longing'
  | 'sad'
  | 'angry'
  | 'anxious'
  | 'tired';

export type TextAlignKey = 'left' | 'center' | 'right';

export type DayLocation = {
  lat: number;
  lng: number;
  name: string;
};

export type DayDoc = {
  id: string;
  authorId: string;
  authorNickname: string;
  authorPhotoURL: string | null;
  /** KST 자정을 가리키는 Timestamp. 작성 가능 시간 제한 판정과 범위 쿼리에 사용. */
  date: Timestamp;
  /** 'YYYY-MM-DD' (KST 기준), 표시용 */
  dateLabel: string;
  title: string;
  /** 글+사진이 순서대로 섞인 본문. */
  contentBlocks: ContentBlock[];
  photoURLs: string[];
  /** photoURLs와 같은 순서로, 각 사진을 화면에 어떤 비율로 보여줄지
   * (업로드 시 사용자가 고른 값). */
  photoAspects: PhotoAspectKey[];
  visibility: DayVisibility;
  groupId: string | null;
  taggedFriendUids: string[];
  taggedFriendNicknames: string[];
  moodTag: MoodKey | null;
  location: DayLocation | null;
  /** 이 DAY의 제목·본문에만 적용되는 글씨체(개인 필체를 고르는 느낌). 앱
   * UI 전체 글씨체와는 무관하다. */
  fontKey: FontPresetKey;
  /** 제목·본문 정렬(왼쪽/가운데/오른쪽). */
  textAlign: TextAlignKey;
  likeCount: number;
  commentCount: number;
  /** 내용(제목/본문/기분/위치)을 수정한 횟수. 작성 후 24시간 안에만 수정할 수
   * 있고, 수정할 때마다 하나씩 늘어난다(0이면 "수정됨" 배지를 안 보여준다). */
  editCount: number;
  /** 월드 데이(공개 피드)에 노출할지. visibility가 'public'이 아니면 이
   * 값과 무관하게 애초에 노출 안 됨(읽기 권한 자체가 없어서) — 이 값은
   * "공개로 쓰긴 했지만 피드에는 안 올라오게" 하고 싶을 때를 위한, visibility
   * 와는 독립적인 별도 스위치다. 언제든 켜고 끌 수 있다. */
  inWorldFeed: boolean;
  /** 내 연혁(히스토리) 화면에 보여줄지. DAY를 썼다고 자동으로 연혁에
   * 들어가는 게 아니라, 이 스위치로 넣고 뺄 수 있다(언제든 변경 가능). */
  inHistory: boolean;
  /** 'draft'는 아직 오지 않은 미래 날짜로 미리 써둔 예정 DAY. 그 날짜가
   *되면(자정~다음날 오전 10시) 작성자가 "확정"해야 'confirmed'로 바뀌고
   * 그때부터 실제 기록(피드/연혁 노출, dayCount 집계)으로 취급된다. 그
   * 기한을 넘기면 영영 확정할 수 없다 — 자동 삭제되진 않지만 그냥 못 쓰게
   * 방치된다. 오늘/어제 날짜로 바로 쓴 보통 DAY는 처음부터 'confirmed'다. */
  status: 'draft' | 'confirmed';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  deleted: boolean;
};

export type NewDayInput = {
  dateLabel: string;
  title: string;
  contentBlocks: ContentBlock[];
  photoLocalUris: string[];
  photoAspects: PhotoAspectKey[];
  visibility: DayVisibility;
  groupId: string | null;
  taggedFriends: { uid: string; nickname: string }[];
  moodTag: MoodKey | null;
  location: DayLocation | null;
  fontKey: FontPresetKey;
  textAlign: TextAlignKey;
  inWorldFeed: boolean;
  inHistory: boolean;
};

export type CommentDoc = {
  id: string;
  authorId: string;
  authorNickname: string;
  authorPhotoURL: string | null;
  body: string;
  createdAt: Timestamp | null;
};

/** users/{uid}/myComments/{commentId} — "내가 쓴 댓글 모아보기" 화면 전용.
 * 실제 댓글(days/{dayId}/comments/{commentId})을 collectionGroup으로 직접
 * 긁어오지 않는다 — 그 쿼리의 보안 규칙이 "이 댓글이 달린 DAY를 지금
 * 볼 수 있는 사람인지"를 매 문서마다 부모 DAY까지 조회해서 판단해야
 * 하는데, Firestore는 collectionGroup 쿼리에서 그런 교차 문서 조회가
 * 필요한 규칙을 permission-denied로 거부한다(likes를 collectionGroup으로
 * 모아볼 때 겪었던 것과 같은 제약). 그래서 댓글을 쓸 때 이 문서에도
 * 내용을 복사해 남겨두고(댓글은 수정이 안 되니 한 번 복사해두면 절대
 * 오래된 내용이 되지 않는다), 이 화면은 내 서브컬렉션만 읽는다 —
 * "본인 것만 읽기"는 교차 문서 조회 없이 표현되니 이 제약 자체가 없다. */
export type MyCommentEntry = {
  commentId: string;
  dayId: string;
  dayTitle: string;
  body: string;
  createdAt: Timestamp | null;
};
