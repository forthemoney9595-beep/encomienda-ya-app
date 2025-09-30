import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { seedDatabase } from "./seeder";

// Your web app's Firebase configuration
const firebaseConfig = {
  projectId: "studio-8973437171-6b185",
  appId: "1:1091869412431:web:e25c7cebb7b151423f2e3a",
  apiKey: "AIzaSyDiFr0AGMK8v_dUnvTu_IhifSBfGBCNQm0",
  authDomain: "studio-8973437171-6b185.firebaseapp.com",
  messagingSenderId: "1091869412431",
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

// Initialize Firebase
if (!getApps().length) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    // Seed the database on initial startup, but only once.
    seedDatabase(db).catch(console.error);
} else {
    app = getApp();
    db = getFirestore(app);
}

auth = getAuth(app);


// Export the services to be used in other parts of the application.
export { app, auth, db };
