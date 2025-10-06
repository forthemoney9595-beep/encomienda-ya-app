
'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

let firebaseApp: FirebaseApp;
let auth: Auth;
let firestore: Firestore;
let storage: FirebaseStorage;

// This guard is necessary to prevent re-initialization on hot reloads
if (getApps().length) {
    firebaseApp = getApp();
} else {
    firebaseApp = initializeApp(firebaseConfig);
}

auth = getAuth(firebaseApp);
firestore = getFirestore(firebaseApp);
storage = getStorage(firebaseApp);

export { firebaseApp, auth, firestore, storage };

// This is the legacy getFirebase function, kept for compatibility with older components
// It is recommended to import services directly (e.g. `import { auth } from '@/firebase'`)
export function getFirebase() {
    return {
        auth,
        firestore,
        storage,
        app: firebaseApp
    };
}
