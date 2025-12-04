import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, onSnapshot, DocumentReference, Query, CollectionReference } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
// ✅ IMPORTAMOS MESSAGING
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

// --- INICIALIZACIÓN (SINGLETON) ---
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- INICIALIZACIÓN SEGURA DE MESSAGING (Solo Cliente) ---
let messaging: Messaging | null = null;

if (typeof window !== 'undefined') {
  try {
    // Solo inicializamos si estamos en el navegador
    messaging = getMessaging(app);
  } catch (error) {
    console.warn("Firebase Messaging no soportado en este navegador o contexto.");
  }
}

// Exportaciones directas de servicios
export { app, auth, db, storage, messaging };

// --- HOOKS SIMPLES ---
export const useAuth = () => auth;
export const useFirestore = () => db;
export const useStorage = () => storage;

// --- NUEVO: FUNCIÓN PARA SOLICITAR PERMISO DE NOTIFICACIONES ---
export const requestNotificationPermission = async () => {
  if (!messaging) return null;

  try {
    // 1. Pedir permiso al navegador
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      // 2. Si acepta, obtenemos el Token usando la VAPID Key
      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
      });
      
      if (token) {
        return token;
      } else {
        console.warn('No se pudo obtener el token de registro FCM.');
        return null;
      }
    } else {
      console.warn('Permiso de notificaciones denegado.');
      return null;
    }
  } catch (error) {
    console.error('Error al solicitar permiso o token:', error);
    return null;
  }
};

// --- HOOKS AVANZADOS (DATA FETCHING EN TIEMPO REAL) ---

/**
 * Hook para suscribirse a una colección o query de Firestore.
 * Devuelve un array de datos que se actualiza en tiempo real.
 */
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
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[];
      setData(items);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching collection:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [query]); 

  return { data, isLoading };
}

/**
 * Hook para suscribirse a un documento individual de Firestore.
 */
export function useDoc<T = any>(docRef: DocumentReference | null) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!docRef) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = onSnapshot(docRef, (doc) => {
      if (doc.exists()) {
        setData({ id: doc.id, ...doc.data() } as T);
      } else {
        setData(null);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching doc:", error);
      setIsLoading(false);
    }, );

    return () => unsubscribe();
  }, [docRef]);

  return { data, isLoading };
}

/**
 * Hook para memoizar referencias de Firebase.
 */
export function useMemoFirebase<T>(factory: () => T, deps: any[]): T {
  return useMemo(factory, deps);
}

/**
 * Función legacy.
 */
export function getFirebase() {
  return { firestore: db, auth, storage, app, messaging };
}