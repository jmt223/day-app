import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  writeBatch,
  type QueryConstraint,
} from '@firebase/firestore';

import { db } from '@/lib/firebase';
import { sendNotification } from '@/data/notifications';
import { getUserProfilesByUids } from '@/data/users';
import type { CommentDoc, MyCommentEntry } from '@/types/day';

function requireDb() {
  if (!db) throw new Error('Firebase가 아직 설정되지 않았습니다.');
  return db;
}

type Author = { uid: string; nickname: string; photoURL: string | null };

export async function listComments(dayId: string): Promise<CommentDoc[]> {
  const database = requireDb();
  const q = query(collection(database, 'days', dayId, 'comments'), orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  const comments = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommentDoc, 'id'>) }));

  // 댓글 작성 당시의 닉네임·사진 대신 "지금" 프로필을 보여준다.
  const profiles = await getUserProfilesByUids(comments.map((c) => c.authorId));
  return comments.map((c) => {
    const author = profiles.get(c.authorId);
    return {
      ...c,
      authorNickname: author?.nickname ?? c.authorNickname,
      authorPhotoURL: author ? author.photoURL : c.authorPhotoURL,
    };
  });
}

export async function addComment(
  dayId: string,
  author: Author,
  body: string,
  dayAuthorId: string,
  dayTitle: string
): Promise<void> {
  const database = requireDb();
  const commentRef = doc(collection(database, 'days', dayId, 'comments'));
  const trimmedBody = body.trim();
  const batch = writeBatch(database);
  batch.set(commentRef, {
    authorId: author.uid,
    authorNickname: author.nickname,
    authorPhotoURL: author.photoURL,
    body: trimmedBody,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(database, 'days', dayId), { commentCount: increment(1) });
  // "내가 쓴 댓글" 목록용 사본 — MyCommentEntry 타입 주석 참고.
  batch.set(doc(database, 'users', author.uid, 'myComments', commentRef.id), {
    commentId: commentRef.id,
    dayId,
    dayTitle,
    body: trimmedBody,
    createdAt: serverTimestamp(),
  });
  await batch.commit();

  if (author.uid !== dayAuthorId) {
    await sendNotification(dayAuthorId, {
      type: 'comment',
      fromUid: author.uid,
      fromNickname: author.nickname,
      dayId,
      dayTitle,
    }).catch(() => undefined);
  }
}

/** 본인이 쓴 댓글만 지울 수 있다(보안 규칙에서도 authorId로 확인). */
export async function deleteComment(dayId: string, commentId: string, authorId: string): Promise<void> {
  const database = requireDb();
  const batch = writeBatch(database);
  batch.delete(doc(database, 'days', dayId, 'comments', commentId));
  batch.update(doc(database, 'days', dayId), { commentCount: increment(-1) });
  batch.delete(doc(database, 'users', authorId, 'myComments', commentId));
  await batch.commit();
}

export type MyCommentsPage = { comments: MyCommentEntry[]; nextCursor: number | null };

/** "내가 쓴 댓글" 화면 전용 페이지네이션 목록. day-list.tsx의 월드데이
 * 목록과 같은 이유로 커서(createdAt) 방식을 쓴다 — 댓글을 많이 남긴
 * 사람일수록 매번 전체를 다시 불러오는 방식은 갈수록 느려지니까. */
export async function listMyCommentsPage(uid: string, pageSize: number, cursorMs?: number | null): Promise<MyCommentsPage> {
  const database = requireDb();
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
  if (cursorMs) constraints.push(startAfter(Timestamp.fromMillis(cursorMs)));
  const snap = await getDocs(query(collection(database, 'users', uid, 'myComments'), ...constraints, limit(pageSize)));
  const comments = snap.docs.map((d) => d.data() as MyCommentEntry);
  const lastDoc = snap.docs[snap.docs.length - 1];
  const lastMs = (lastDoc?.data().createdAt as Timestamp | undefined)?.toMillis() ?? null;
  return { comments, nextCursor: snap.docs.length === pageSize ? lastMs : null };
}
