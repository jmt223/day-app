/**
 * 펫 편지의 서버 쪽 상태 변화(도착 처리, 답장 처리, 자동 복귀, 회수,
 * 쓰다듬기/간식, 재문의)를 한곳에 모았다. index.js는 트리거/HTTP를 여기
 * 함수에 연결만 한다 — 그래서 에뮬레이터에서 이 모듈을 직접 불러 테스트할 수
 * 있다.
 *
 * pet.status(idle/away)가 도배 방지의 핵심이라 away -> idle 전환과 친밀도·
 * 배달 기록·손상 추첨은 전부 여기(Admin SDK)에서만 한다. 클라이언트는 보안
 * 규칙상 이 값들을 못 바꾼다(firestore.rules의 pets/letters 규칙 참고).
 */

const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const { applyIntimacyGain, rollBehavior, rollDamageCells } = require('./pet-logic');

class ActionError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function createLettersCore({ db, getRules }) {

  function letterRef(letterId) {
    return db.doc(`letters/${letterId}`);
  }

  function petRef(uid, petId) {
    return db.doc(`users/${uid}/pets/${petId}`);
  }

  async function notify(toUid, data) {
    try {
      await db.collection(`users/${toUid}/notifications`).add({
        ...data,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error('알림을 남기지 못했어요', data.type, err);
    }
  }

  function waitMinutesOf(letter) {
    if (typeof letter.waitMinutes === 'number') return letter.waitMinutes;
    return (typeof letter.waitHours === 'number' ? letter.waitHours : 24) * 60;
  }

  /** 펫이 집으로 돌아올 때(답장/시간 종료/조기 복귀/회수) 공통으로 바뀌는
   * 값. 친밀도는 "배달 후 복귀 완료" 몫(+1, 하루 3번까지)을 여기서 준다. */
  function returnPetPatch(pet, nowMs, rules, extraIncrements = {}) {
    const gain = applyIntimacyGain(pet, 'delivery', nowMs, rules);
    const patch = {
      status: 'idle',
      currentLetterId: null,
      intimacy: gain.intimacy,
      daily: gain.daily,
      'stats.deliveries': FieldValue.increment(1),
    };
    for (const [key, value] of Object.entries(extraIncrements)) {
      if (value) patch[`stats.${key}`] = FieldValue.increment(value);
    }
    return patch;
  }

  /**
   * 편지가 생기면(보안 규칙이 "보낸 사람의 idle 펫으로만" 만들었음을 이미
   * 검증함) 도착 손상, 복귀 시각, 성격 예외 행동을 정한다. 트리거는 같은
   * 이벤트로 두 번 올 수도 있어서(at-least-once), 이미 처리된 편지
   * (replyDeadline이 채워짐)는 건너뛴다 — 손상을 두 번 굴리면 안 된다.
   */
  async function handleLetterCreated(letterId) {
    const rules = await getRules();
    const ref = letterRef(letterId);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const letter = snap.data();
      if (letter.replyDeadline) return null;

      const pRef = petRef(letter.fromUid, letter.fromPetId);
      const petSnap = await tx.get(pRef);
      const pet = petSnap.exists ? petSnap.data() : {};
      const personality = pet.personality || 'easygoing';

      const kind = letter.kind === 'summon_response' ? 'summon_response' : 'letter';
      const waitMs = waitMinutesOf(letter) * 60 * 1000;
      const createdAtMs = letter.createdAt ? letter.createdAt.toMillis() : Date.now();
      const { behavior, ratio } = rollBehavior(personality, rules);
      const autoReturnMs =
        behavior === 'overstay' ? null : behavior === 'early_return' ? createdAtMs + Math.round(waitMs * ratio) : createdAtMs + waitMs;
      const cells = kind === 'letter' ? rollDamageCells(letter.body, personality, pet.intimacy || 0, rules) : [];

      tx.update(ref, {
        kind,
        replyDeadline: Timestamp.fromMillis(createdAtMs + waitMs),
        autoReturnAt: autoReturnMs === null ? null : Timestamp.fromMillis(autoReturnMs),
        behavior,
        outboundDamage: cells.length > 0 ? 'cells' : 'none',
        outboundDamageCells: cells,
        overstayNotified: false,
      });
      if (petSnap.exists && cells.length > 0) {
        tx.update(pRef, { 'stats.damaged': FieldValue.increment(1) });
      }
      return { letter, kind };
    });

    if (!result) return;
    const { letter, kind } = result;
    if (kind === 'summon_response') {
      // 호출에 응답해서 펫을 보냈으니 그 호출은 끝난 것으로 표시한다(다시
      // "펫 보내줘" 카드가 뜨지 않게). 호출 문서는 users/{호출받은 사람}/
      // incomingSummons/{호출한 사람}에 있다.
      await db
        .doc(`users/${letter.fromUid}/incomingSummons/${letter.toUid}`)
        .set({ handledAt: FieldValue.serverTimestamp() }, { merge: true })
        .catch((err) => console.error('호출 처리 표시 실패', err));
    }
    await notify(letter.toUid, {
      type: kind === 'summon_response' ? 'summon_accepted' : 'letter_received',
      fromUid: letter.fromUid,
      fromNickname: letter.fromNickname,
      letterId,
      petName: letter.fromPetName,
    });
  }

  /**
   * 답장이 도착하면(letters/{id}/reply/main) 돌아오는 길의 손상을 따로
   * 굴리고, 답장을 부모 편지 문서에도 복사해둔다(대화창이 편지 목록만 구독해도
   * 답장까지 같이 보이게). 펫이 아직 기다리는 중이었으면 집으로 돌려보낸다.
   * 이미 처리된 답장(편지에 reply가 있음)은 건너뛴다.
   */
  async function handleReplyCreated(letterId, replyId) {
    const rules = await getRules();
    const ref = letterRef(letterId);
    const replyRef = ref.collection('reply').doc(replyId);
    const nowMs = Date.now();

    const result = await db.runTransaction(async (tx) => {
      const [letterSnap, replySnap] = await Promise.all([tx.get(ref), tx.get(replyRef)]);
      if (!letterSnap.exists || !replySnap.exists) return null;
      const letter = letterSnap.data();
      if (letter.reply) return null;
      const reply = replySnap.data();

      const pRef = petRef(letter.fromUid, letter.fromPetId);
      const petSnap = await tx.get(pRef);
      const pet = petSnap.exists ? petSnap.data() : null;
      const wasWaiting = letter.status === 'awaiting_reply';

      // 답장 손상에도 "그 답장을 물고 오는 펫"(원래 보낸 사람의 펫)과 그
      // 주인 사이의 친밀도를 적용한다.
      const cells = rollDamageCells(reply.body, (pet && pet.personality) || 'easygoing', (pet && pet.intimacy) || 0, rules);
      const damage = cells.length > 0 ? 'cells' : 'none';

      tx.update(replyRef, { damage, damageCells: cells });
      const letterPatch = {
        reply: { body: reply.body, damage, damageCells: cells, createdAt: reply.createdAt || FieldValue.serverTimestamp() },
      };
      if (wasWaiting) {
        letterPatch.status = 'replied';
        letterPatch.repliedAt = FieldValue.serverTimestamp();
      }
      tx.update(ref, letterPatch);

      if (pet && wasWaiting && pet.currentLetterId === letterId) {
        tx.update(pRef, returnPetPatch(pet, nowMs, rules, { damaged: cells.length > 0 ? 1 : 0 }));
      } else if (pet && cells.length > 0) {
        tx.update(pRef, { 'stats.damaged': FieldValue.increment(1) });
      }
      return { letter };
    });

    if (!result) return;
    const { letter } = result;
    await notify(letter.fromUid, {
      type: 'letter_replied',
      fromUid: letter.toUid,
      fromNickname: letter.toNickname,
      letterId,
      petName: letter.fromPetName,
    });
  }

  /** 기다리던 펫을 집으로 돌려보낸다(시간 종료 또는 서두르는 성격의 조기
   * 복귀). 그 사이 답장/회수로 이미 상태가 바뀌었으면 아무것도 안 한다. */
  async function returnOverduePet(docRef, now) {
    const rules = await getRules();
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const letter = snap.data();
      if (letter.status !== 'awaiting_reply' || !letter.autoReturnAt || letter.autoReturnAt.toMillis() > now.toMillis()) {
        return null;
      }
      const pRef = petRef(letter.fromUid, letter.fromPetId);
      const petSnap = await tx.get(pRef);
      const early = letter.behavior === 'early_return';

      tx.update(docRef, { status: 'expired', returnReason: early ? 'early' : 'timeout', expiredAt: now });
      if (petSnap.exists && petSnap.data().currentLetterId === docRef.id) {
        tx.update(pRef, returnPetPatch(petSnap.data(), now.toMillis(), rules, { earlyReturns: early ? 1 : 0 }));
      }
      return { letter, early };
    });
  }

  /**
   * 1분마다 돈다.
   *  1) 복귀 시각(autoReturnAt)이 지난 펫을 돌려보낸다.
   *  2) 여유로운 성격이라 시간이 끝나도 계속 머무는 펫은, 처음 시간이 끝났을
   *     때 주인에게 한 번만 알려준다(그 뒤로는 답장을 받거나 회수할 때까지
   *     그대로 머문다 — autoReturnAt이 null이라 1번 쿼리에 안 걸린다).
   */
  async function sweepLetters(now = Timestamp.now()) {
    const dueSnap = await db
      .collection('letters')
      .where('status', '==', 'awaiting_reply')
      .where('autoReturnAt', '<=', now)
      .limit(200)
      .get();

    for (const docSnap of dueSnap.docs) {
      try {
        const result = await returnOverduePet(docSnap.ref, now);
        if (!result) continue;
        const { letter, early } = result;
        await notify(letter.fromUid, {
          type: early ? 'pet_early_return' : 'letter_expired',
          fromUid: letter.toUid,
          fromNickname: letter.toNickname,
          letterId: docSnap.id,
          petName: letter.fromPetName,
        });
      } catch (err) {
        console.error('sweepLetters: 복귀 처리 실패', docSnap.id, err);
      }
    }

    const overstaySnap = await db
      .collection('letters')
      .where('status', '==', 'awaiting_reply')
      .where('behavior', '==', 'overstay')
      .where('overstayNotified', '==', false)
      .where('replyDeadline', '<=', now)
      .limit(200)
      .get();

    for (const docSnap of overstaySnap.docs) {
      try {
        const letter = docSnap.data();
        const batch = db.batch();
        batch.update(docSnap.ref, { overstayNotified: true });
        const pRef = petRef(letter.fromUid, letter.fromPetId);
        const petSnap = await pRef.get();
        if (petSnap.exists) batch.update(pRef, { 'stats.overstays': FieldValue.increment(1) });
        await batch.commit();
        await notify(letter.fromUid, {
          type: 'pet_overstay',
          fromUid: letter.toUid,
          fromNickname: letter.toNickname,
          letterId: docSnap.id,
          petName: letter.fromPetName,
        });
      } catch (err) {
        console.error('sweepLetters: 머무는 중 알림 실패', docSnap.id, err);
      }
    }

    return { returned: dueSnap.size, overstays: overstaySnap.size };
  }

  /** "일로 와" — 주인이 언제든 즉시 회수한다. 기존 메시지는 대화창에 그대로
   * 남고, 펫 대기 표시만 사라진다(편지 status가 recalled로 바뀜). */
  async function recallPet(uid, petId) {
    const rules = await getRules();
    const pRef = petRef(uid, petId);
    const now = Timestamp.now();
    return db.runTransaction(async (tx) => {
      const petSnap = await tx.get(pRef);
      if (!petSnap.exists) throw new ActionError(404, 'pet-not-found');
      const pet = petSnap.data();
      if (pet.status !== 'away') throw new ActionError(409, 'pet-not-away');

      const letterId = pet.currentLetterId;
      const lRef = letterId ? letterRef(letterId) : null;
      const letterSnap = lRef ? await tx.get(lRef) : null;
      if (letterSnap && letterSnap.exists && letterSnap.data().status === 'awaiting_reply') {
        tx.update(lRef, { status: 'recalled', recalledAt: now });
      }
      tx.update(pRef, returnPetPatch(pet, now.toMillis(), rules, { recalls: 1 }));
      return { ok: true, letterId: letterId || null };
    });
  }

  /**
   * 쓰다듬기 / 간식 주기.
   *  - 주인: 각각 하루 1번, 친밀도 +1(하루 최대·100 상한 안에서).
   *  - 펫이 지금 기다리고 있는 상대방: 이번 방문에 각각 1번. 반응과 배달
   *    기록에만 남고 주인과의 친밀도는 안 올린다.
   * 간식은 아직 획득/소모 방식이 정해지지 않아서(기획 미정) 따로 개수를
   * 차감하지 않는다.
   */
  async function interactWithPet(uid, ownerUid, petId, kind) {
    if (kind !== 'pet' && kind !== 'snack') throw new ActionError(400, 'bad-kind');
    const rules = await getRules();
    const pRef = petRef(ownerUid, petId);
    const nowMs = Date.now();

    return db.runTransaction(async (tx) => {
      const petSnap = await tx.get(pRef);
      if (!petSnap.exists) throw new ActionError(404, 'pet-not-found');
      const pet = petSnap.data();

      if (uid === ownerUid) {
        const gain = applyIntimacyGain(pet, kind, nowMs, rules);
        if (!gain.allowed) throw new ActionError(409, 'already-today');
        tx.update(pRef, {
          intimacy: gain.intimacy,
          daily: gain.daily,
          [`stats.${kind === 'pet' ? 'ownerPets' : 'ownerSnacks'}`]: FieldValue.increment(1),
        });
        return { ok: true, by: 'owner', gained: gain.gained, intimacy: gain.intimacy };
      }

      if (pet.status !== 'away' || !pet.currentLetterId) throw new ActionError(403, 'pet-not-visiting');
      const lRef = letterRef(pet.currentLetterId);
      const letterSnap = await tx.get(lRef);
      if (!letterSnap.exists) throw new ActionError(403, 'pet-not-visiting');
      const letter = letterSnap.data();
      const stillHere =
        letter.status === 'awaiting_reply' && (!letter.autoReturnAt || letter.autoReturnAt.toMillis() >= nowMs);
      if (letter.toUid !== uid || !stillHere) throw new ActionError(403, 'pet-not-visiting');

      const flag = kind === 'pet' ? 'petted' : 'snacked';
      if (letter.visitor && letter.visitor[flag]) throw new ActionError(409, 'already-this-visit');
      tx.update(lRef, { [`visitor.${flag}`]: true });
      tx.update(pRef, { [`stats.${kind === 'pet' ? 'pettedByOthers' : 'snacksFromOthers'}`]: FieldValue.increment(1) });
      return { ok: true, by: 'visitor', gained: 0, intimacy: pet.intimacy || 0 };
    });
  }

  /**
   * "뭐라고 했어?" — 손상된 메시지를 받은 사람이 보낸 사람에게 다시 물어본다.
   * 메시지 하나당 한 번만. 원문을 자동으로 보여주거나 자동 재전송하지 않고,
   * 알림만 보낸다(다시 보내려면 보낸 사람이 자기 펫으로 새로 보내야 한다).
   *  - part 'outbound': 내가 받은 편지(나 = toUid)
   *  - part 'reply': 내 편지에 온 답장(나 = fromUid)
   */
  async function reaskLetter(uid, letterId, part) {
    if (part !== 'outbound' && part !== 'reply') throw new ActionError(400, 'bad-part');
    // 알림에 찍힐 이름은 요청에서 받지 않고 실제 프로필에서 읽는다(사칭 방지).
    const profileSnap = await db.doc(`users/${uid}`).get();
    const nickname = (profileSnap.exists && profileSnap.data().nickname) || '';
    const lRef = letterRef(letterId);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(lRef);
      if (!snap.exists) throw new ActionError(404, 'letter-not-found');
      const letter = snap.data();
      const field = part === 'outbound' ? 'outboundReaskedAt' : 'replyReaskedAt';
      const receiver = part === 'outbound' ? letter.toUid : letter.fromUid;
      const cells = part === 'outbound' ? letter.outboundDamageCells : letter.reply && letter.reply.damageCells;
      if (receiver !== uid) throw new ActionError(403, 'not-receiver');
      if (!Array.isArray(cells) || cells.length === 0) throw new ActionError(409, 'not-damaged');
      if (letter[field]) throw new ActionError(409, 'already-asked');
      tx.update(lRef, { [field]: Timestamp.now() });
      return { letter, askTo: part === 'outbound' ? letter.fromUid : letter.toUid };
    });

    await notify(result.askTo, {
      type: 'letter_reask',
      fromUid: uid,
      fromNickname: nickname,
      letterId,
      part,
    });
    return { ok: true };
  }

  return { handleLetterCreated, handleReplyCreated, sweepLetters, recallPet, interactWithPet, reaskLetter };
}

module.exports = { createLettersCore, ActionError };
