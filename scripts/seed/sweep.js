#!/usr/bin/env node
'use strict';
/**
 * 로컬 에뮬레이터에서 펫 자동 복귀를 돌린다(npm run emu:sweep).
 *
 * 운영에서는 expireOverdueLetters 스케줄 함수가 1분마다 sweepLetters를 부르는데,
 * 에뮬레이터는 스케줄 함수를 실행하지 않는다 — 그래서 시간이 끝난 펫이 돌아오지
 * 않고, "계속 머무는 중" 알림도 안 간다. 이 스크립트가 같은 코드(functions/
 * letters-core.js)를 에뮬레이터에 대고 1분마다 대신 실행한다. --once면 한 번만.
 */
const path = require('path');
const { createRequire } = require('module');

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-day-app';
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const ROOT = path.resolve(__dirname, '..', '..');
const fnRequire = createRequire(path.join(ROOT, 'functions', 'package.json'));
const admin = fnRequire('firebase-admin');
const { createLettersCore } = require(path.join(ROOT, 'functions', 'letters-core.js'));
const { createRulesLoader } = require(path.join(ROOT, 'functions', 'pet-config.js'));

admin.initializeApp({ projectId: 'demo-day-app' });
const db = admin.firestore();
const core = createLettersCore({ db, getRules: createRulesLoader(db) });
const once = process.argv.includes('--once');

async function tick() {
  const time = new Date().toTimeString().slice(0, 8);
  try {
    const { returned, overstays } = await core.sweepLetters();
    console.log(`${time}  돌아온 펫 ${returned} · 계속 머묾 알림 ${overstays}`);
  } catch (err) {
    console.error(`${time}  실패: ${err.message}`);
    if (once) process.exitCode = 1;
  }
}

tick().then(() => {
  if (once) return;
  console.log('1분마다 확인해요. 끝내려면 Ctrl+C');
  setInterval(tick, 60 * 1000);
});
