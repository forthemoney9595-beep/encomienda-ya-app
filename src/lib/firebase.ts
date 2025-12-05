import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, onSnapshot, DocumentReference, Query, CollectionReference } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, Messaging } from 'firebase/messaging';
import { useEffect, useState, useMemo } from 'react';

// --- CONFIGURACIÓN ---
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// --- INICIALIZACIÓN ---
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- MESSAGING ---
let messaging: Messaging | null = null;

if (typeof window !== 'undefined') {
  try {
    messaging = getMessaging(app);
    console.log("✅ Firebase Messaging inicializado correctamente.");
  } catch (error) {
    console.error("❌ Error inicializando Messaging:", error);
  }
}

export { app, auth, db, storage, messaging };

// --- HOOKS ---
export const useAuth = () => auth;
export const useFirestore = () => db;
export const useStorage = () => storage;

// --- SOLICITAR PERMISO (DEBUG MODE) ---
export const requestNotificationPermission = async () => {
  console.log("🚀 Iniciando solicitud de permisos...");

  if (!messaging) {
    console.error("❌ Messaging es NULL. No se puede pedir token.");
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    console.log("Estado del permiso:", permission);
    
    if (permission === 'granted') {
      console.log("Intentando obtener token con VAPID Key...");
      
      // ⚠️ HARDCODE TEMPORAL PARA DESCARTAR ERRORES DE ENV
      // Usamos tu clave directa
      const currentVapidKey = "BIiNvdw3se4IvGtF8W-lhWqqqxcVGmG1ALI1Po9ERzp8Mr25wSc7Yg7pdP_NUpKWJ-lwMmZr3vWqbkmnbKTvFfQ";

      const token = await getToken(messaging, {
        vapidKey: currentVapidKey
      });
      
      if (token) {
        console.log("✅ ¡TOKEN GENERADO CON ÉXITO!", token);
        return token;
      } else {
        console.warn('⚠️ Se obtuvo permiso pero no hay token.');
        return null;
      }
    } else {
      console.warn('Permiso denegado por el usuario.');
      return null;
    }
  } catch (error) {
    console.error('❌ ERROR CRÍTICO AL OBTENER TOKEN:', error);
    return null;
  }
};

// ... (El resto de hooks useCollection, useDoc, etc. déjalos igual que antes)
export function useCollection<T = any>(query: Query | CollectionReference | null) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!query) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsubscribe = onSnapshot(query, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
      setData(items);
      setIsLoading(false);
    }, (error) => { console.error(error); setIsLoading(false); });
    return () => unsubscribe();
  }, [query]); 
  return { data, isLoading };
}

export function useDoc<T = any>(docRef: DocumentReference | null) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!docRef) { setIsLoading(false); return; }
    setIsLoading(true);
    const unsubscribe = onSnapshot(docRef, (doc) => {
      if (doc.exists()) setData({ id: doc.id, ...doc.data() } as T);
      else setData(null);
      setIsLoading(false);
    }, (error) => { console.error(error); setIsLoading(false); });
    return () => unsubscribe();
  }, [docRef]);
  return { data, isLoading };
}

export function useMemoFirebase<T>(factory: () => T, deps: any[]): T { return useMemo(factory, deps); }
export function getFirebase() { return { firestore: db, auth, storage, app, messaging }; }