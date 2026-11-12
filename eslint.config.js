// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Node로 실행하는 스크립트(테스트 데이터 생성기 등) — 앱 번들이 아니라 Node 전역을 쓴다.
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: { __dirname: "readonly", __filename: "readonly", Buffer: "readonly", process: "readonly" },
    },
  },
]);
