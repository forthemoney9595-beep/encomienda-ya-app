// This file is intentionally left blank. It has been replaced by the /src/firebase directory.
// It is kept to avoid breaking old imports until they are all updated.
// The getFirebase function is now in /src/firebase/index.ts

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';

// This is a singleton to ensure we only initialize firebase once.
let firebaseApp: ReturnType<typeof initializeApp> | undefined;

/**
 * Gets the firebase services.
 * @returns an object with the firestore, auth and app services.
 */
export function getFirebase() {
  if (firebaseApp) {
    const auth = getAuth(firebaseApp);
    const firestore = getFirestore(firebaseApp);
    return { firestore, auth, app: firebaseApp };
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  firebaseApp = app;
  return { firestore, auth, app };
}
