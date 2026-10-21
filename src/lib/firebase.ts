import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, DocumentReference, Query, CollectionReference, FirestoreError } from 'firebase/firestore';
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';
import * as Sentry from '@sentry/nextjs';
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
// 🚨 ARQ-001 (auditoría oct 2026): este módulo es AHORA la ÚNICA capa de Firebase del cliente.
// Antes convivía con src/firebase/* (provider + hooks propios con comportamiento OPUESTO ante
// errores: etiquetaba TODO como permiso y re-lanzaba → "Algo salió mal", y data null vs []).
// Las dos inicializaban el SDK por separado y en /favorites aparecía
// "INTERNAL ASSERTION FAILED" por las dos instancias conviviendo. Regla: nada importa de
// '@/firebase' (ya no existe); todo sale de acá.
const isBrowser = typeof window !== 'undefined';
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// PERF-012: getAuth() bootea el iframe de popup/redirect (~130 kB + 3 requests) en CADA página.
// initializeAuth sin popupRedirectResolver no lo carga; el login con Google le pasa
// browserPopupRedirectResolver explícito a signInWithPopup (login y signup/buyer).
function makeAuth() {
  if (!isBrowser) return getAuth(app);
  try {
    return initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  } catch {
    return getAuth(app); // ya inicializada (HMR): reusar
  }
}
const auth = makeAuth();

// PERF-008: caché local persistente (IndexedDB). Cada apertura reanuda los listeners con su
// resume token en vez de re-leer el result set completo — la mayor mejora de velocidad
// percibida en PWA/APK y ~10× menos lecturas por apertura. Multi-pestaña para que dos
// pestañas no se peleen por la caché. Si IndexedDB no está (modo privado), el SDK cae solo a
// memoria; si ya había una instancia (HMR), se reusa.
function makeDb() {
  if (!isBrowser) return getFirestore(app);
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return getFirestore(app);
  }
}
const db = makeDb();
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
// Hooks de lectura en vivo. Contrato (vale para las páginas que vinieron de la capa vieja):
// `data` arranca en [] / null (nunca undefined), `isLoading` arranca en true si hay query,
// y `error` trae el FirestoreError si el listener falla (permission-denied, índice faltante)
// — se reporta a Sentry y la página sigue con datos vacíos; NUNCA se re-lanza (BUG-300).
function reportListenerError(error: FirestoreError, what: string) {
  console.error(`[firebase] ${what}:`, error?.code || error);
  try { Sentry.captureException(error, { tags: { area: 'firestore-listener' }, extra: { what } }); } catch { /* noop */ }
}

export function useCollection<T = any>(query: Query | CollectionReference | null) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(!!query);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!query) {
      setData([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    const unsubscribe = onSnapshot(query, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
      setData(items);
      setError(null);
      setIsLoading(false);
    }, (err) => {
      reportListenerError(err, 'useCollection ' + ((query as any)?.path ?? 'query'));
      setData([]);
      setError(err);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [query]);
  return { data, isLoading, error };
}

export function useDoc<T = any>(docRef: DocumentReference | null) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(!!docRef);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!docRef) { setData(null); setIsLoading(false); setError(null); return; }
    setIsLoading(true);
    setError(null);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) setData({ id: snap.id, ...snap.data() } as T);
      else setData(null);
      setError(null);
      setIsLoading(false);
    }, (err) => {
      reportListenerError(err, 'useDoc ' + docRef.path);
      setData(null);
      setError(err);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [docRef]);
  return { data, isLoading, error };
}

export function useMemoFirebase<T>(factory: () => T, deps: any[]): T { return useMemo(factory, deps); }