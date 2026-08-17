import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, DocumentReference, Query, CollectionReference } from 'firebase/firestore';
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
// Tanda C: useStorage y getFirebase eliminados (0 importadores en toda la app).
export const useAuth = () => auth;
export const useFirestore = () => db;

// --- GUARDAR EL TOKEN PUSH DE ESTE DISPOSITIVO (único punto de escritura) ---
// Reemplaza al token ANTERIOR del mismo dispositivo: cuando un aparato re-registra (limpió
// datos, rotó el token), el viejo puede seguir VIVO en FCM un tiempo — si queda en
// fcmTokens, ese aparato recibe cada push DOS veces (visto en la prueba del 15/8: la PC
// tenía 2 tokens vigentes y toda notificación llegaba duplicada). El último token de este
// dispositivo se recuerda en localStorage y se saca del array al registrar uno nuevo.
export const persistFcmToken = async (uid: string, token: string): Promise<void> => {
  const KEY = 'eya-fcm-token';
  let prev: string | null = null;
  try { prev = localStorage.getItem(KEY); } catch { /* sin localStorage, sin reemplazo */ }
  const userRef = doc(db, 'users', uid);
  if (prev && prev !== token) {
    await updateDoc(userRef, { fcmTokens: arrayRemove(prev) }).catch(() => { /* mejor esfuerzo */ });
  }
  await updateDoc(userRef, {
    fcmToken: token,
    fcmTokens: arrayUnion(token),
    notificationsEnabled: true,
  });
  try { localStorage.setItem(KEY, token); } catch { /* ídem */ }
};

// --- SOLICITAR PERMISO DE NOTIFICACIONES ---
// Devuelve también el motivo del fallo: devolver null "a secas" hacía que la campanita
// no pudiera explicar NADA cuando algo fallaba (prueba del APK, 15/8).
export const requestNotificationPermission = async (): Promise<{ token: string | null; error: string | null }> => {
  if (!messaging) {
    return { token: null, error: 'El sistema de avisos no está disponible en este navegador.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { token: null, error: null }; // sin permiso — no es un fallo técnico
    }

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    });

    return { token: token || null, error: token ? null : 'No se recibió el identificador del dispositivo.' };
  } catch (error: any) {
    console.error('Error al obtener token de notificaciones:', error);
    return { token: null, error: error?.message || String(error) };
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