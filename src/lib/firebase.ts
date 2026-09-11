import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApps, initializeApp } from '@firebase/app';
import { Auth, getAuth, getReactNativePersistence, initializeAuth } from '@firebase/auth';
import { Firestore, initializeFirestore } from '@firebase/firestore';
import { FirebaseStorage, getStorage } from '@firebase/storage';
import { Platform } from 'react-native';

import { firebaseConfig, isFirebaseConfigured } from '@/lib/env';

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
}

export { app, auth, db, storage };
export { isFirebaseConfigured };
