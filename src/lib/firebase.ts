import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApps, initializeApp } from '@firebase/app';
import { Auth, connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth } from '@firebase/auth';
import { connectFirestoreEmulator, Firestore, initializeFirestore } from '@firebase/firestore';
import { connectStorageEmulator, FirebaseStorage, getStorage } from '@firebase/storage';
import { Platform } from 'react-native';

import { firebaseConfig, isFirebaseConfigured } from '@/lib/env';
import { emulatorHost, useFirebaseEmulator } from '@/lib/functions-url';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

  if (Platform.OS === 'web') {
    // getReactNativePersistence(AsyncStorage)는 네이티브 전용 - 웹 번들에는 존재하지 않는다.
    auth = getAuth(app);
  } else {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }

  // React Native의 fetch 스트리밍 제약을 피하기 위해 자동 롱폴링 감지를 켠다.
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
  });

  storage = getStorage(app);

  // 로컬 테스트 전용(EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1). 배포 빌드에는 이
  // 값이 없어서 이 분기를 절대 타지 않는다.
  if (useFirebaseEmulator) {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, 8080);
    connectStorageEmulator(storage, emulatorHost, 9199);
  }
}

export { app, auth, db, storage };
export { isFirebaseConfigured };
