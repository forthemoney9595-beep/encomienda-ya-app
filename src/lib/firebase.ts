import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  projectId: "studio-8973437171-6b185",
  appId: "1:1091869412431:web:e25c7cebb7b151423f2e3a",
  apiKey: "AIzaSyDiFr0AGMK8v_dUnvTu_IhifSBfGBCNQm0",
  authDomain: "studio-8973437171-6b185.firebaseapp.com",
  messagingSenderId: "1091869412431",
  storageBucket: "studio-8973437171-6b185.appspot.com",
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

// Initialize Firebase
if (!getApps().length) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
} else {
    app = getApp();
    db = getFirestore(app);
    storage = getStorage(app);
}

auth = getAuth(app);


// Export the services to be used in other parts of the application.
export { app, auth, db, storage };
