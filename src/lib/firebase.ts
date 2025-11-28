import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
// ✅ IMPORTANTE: Importamos Storage
import { getStorage } from 'firebase/storage';
import { firebaseConfig } from '@/firebase/config';

// Inicialización Singleton
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// ✅ Inicializamos Storage
const storage = getStorage(app);

// --- HOOKS Y EXPORTACIONES PARA COMPONENTES NUEVOS ---
// Estos son necesarios para que image-upload.tsx y profile/page.tsx funcionen
export const useAuth = () => auth;
export const useFirestore = () => db;
export const useStorage = () => storage;

// Exportaciones directas
export { app, auth, db, storage };

/**
 * Función legacy para compatibilidad con código anterior.
 * Ahora incluye 'storage' en el objeto retornado.
 */
export function getFirebase() {
  return { firestore: db, auth, storage, app };
}