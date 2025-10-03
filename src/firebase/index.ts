'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore'

// This is a singleton to ensure we only initialize firebase once.
// This is not strictly needed for this simple case, but good practice.
let firebaseApp: ReturnType<typeof initializeApp> | undefined;

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase() {
  if (getApps().length) {
    return getSdks(getApp());
  }

  const newFirebaseApp = initializeApp(firebaseConfig);
  return getSdks(newFirebaseApp);
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp)
  };
}

// This is the legacy getFirebase function, kept for compatibility with older components
// New components should use the individual hooks like useFirestore() and useAuth() from a provider
export function getFirebase() {
    if (firebaseApp) {
        return {
            auth: getAuth(firebaseApp),
            firestore: getFirestore(firebaseApp),
            app: firebaseApp
        };
    }
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    firebaseApp = app;
    return {
      auth: getAuth(app),
      firestore: getFirestore(app),
      app: app
    };
}
