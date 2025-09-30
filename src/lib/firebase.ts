// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration, now from environment variables
const firebaseConfig = {
  "projectId": "studio-8973437171-6b185",
  "appId": "1:1091869412431:web:e25c7cebb7b151423f2e3a",
  "apiKey": "AIzaSyDiFr0AGMK8v_dUnvTu_IhifSBfGBCNQm0",
  "authDomain": "studio-8973437171-6b185.firebaseapp.com",
  "messagingSenderId": "1091869412431",
  "storageBucket": "studio-8973437171-6b185.appspot.com",
};

// Initialize Firebase for SSR
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
