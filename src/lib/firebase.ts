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
  } catch (error) {
    console.error("Error inicializando Firebase Messaging:", error);
  }
}

export { app, auth, db, storage, messaging };

// --- HOOKS ---
export const useAuth = () => auth;
export const useFirestore = () => db;
export const useStorage = () => storage;

// --- SOLICITAR PERMISO DE NOTIFICACIONES ---
export const requestNotificationPermission = async () => {
  if (!messaging) {
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    });

    return token || null;
  } catch (error) {
    console.error('Error al obtener token de notificaciones:', error);
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