// FICHERO NUEVO: src/firebase/server.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

// Este archivo es para uso exclusivo del SERVIDOR.
// NO debe incluir la directiva 'use client'.

let firebaseApp: FirebaseApp;

// Inicialización segura en el lado del servidor
if (!getApps().length) {
  firebaseApp = initializeApp(firebaseConfig, "firebase-server-app");
} else {
  firebaseApp = getApp("firebase-server-app");
}

const storage: FirebaseStorage = getStorage(firebaseApp);

export { storage };
