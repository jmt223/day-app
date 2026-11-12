#!/usr/bin/env node
'use strict';
/**
 * 웹 앱을 로컬 에뮬레이터(demo-day-app)에 붙여서 띄운다 — 운영 데이터는 건드리지 않는다.
 * 윈도우/맥 어디서나 같은 명령(npm run web:emu)으로 쓰려고 환경변수를 여기서 넣는다.
 */
const { spawn } = require('child_process');

const env = {
  ...process.env,
  EXPO_PUBLIC_USE_FIREBASE_EMULATOR: '1',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-day-app',
};
const child = spawn('npx', ['expo', 'start', '--web', ...process.argv.slice(2)], { stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
