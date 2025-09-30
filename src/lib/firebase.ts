import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  projectId: "studio-8973437171-6b185",
  appId: "1:1091869412431:web:e25c7cebb7b151423f2e3a",
  apiKey: "AIzaSyDiFr0AGMK8v_dUnvTu_IhifSBfGBCNQm0",
  authDomain: "studio-8973437171-6b185.firebaseapp.com",
  messagingSenderId: "1091869412431",
};

// This file is now responsible ONLY for creating and exporting the Firebase services.
// The initialization is handled in a client-side provider to ensure it runs correctly.

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

// This function will be called from a client component to initialize Firebase.
export function initializeFirebase() {
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } else {
        app = getApp();
        auth = getAuth(app);
        db = getFirestore(app);
    }
}

// Export the services to be used in other parts of the application.
// Note: These will be uninitialized until initializeFirebase() is called.
export { app, auth, db };
