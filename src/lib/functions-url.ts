import { firebaseConfig } from '@/lib/env';

const REGION = 'asia-northeast3';

/** 로컬 개발/테스트에서 Firebase 에뮬레이터에 붙을지. 배포 빌드에선 이 값이
 * 없어서(EXPO_PUBLIC_*는 빌드할 때 박힌다) 항상 실제 서버로 간다. */
export const useFirebaseEmulator = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1';
export const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1';

/** HTTP Cloud Function 주소. 예전엔 프로젝트 ID가 박힌 주소를 파일마다 따로
 * 들고 있었는데, 프로젝트를 바꾸거나 에뮬레이터로 테스트할 때 전부 찾아
 * 고쳐야 해서 한곳으로 모았다. */
export function functionUrl(name: string): string {
  const projectId = firebaseConfig.projectId;
  if (useFirebaseEmulator) {
    return `http://${emulatorHost}:5001/${projectId}/${REGION}/${name}`;
  }
  return `https://${REGION}-${projectId}.cloudfunctions.net/${name}`;
}
