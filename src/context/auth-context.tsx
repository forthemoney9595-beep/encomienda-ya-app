'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { 
    onAuthStateChanged, 
    User, 
    signInWithCustomToken 
} from 'firebase/auth';
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore'; // ✅ Agregamos updateDoc y arrayUnion
import { getToken } from 'firebase/messaging'; // ✅ Importamos getToken
// ✅ Importamos messaging también
import { auth, db, messaging } from '@/lib/firebase';

// Definimos la interfaz del perfil
export interface UserProfile {
  id?: string; 
  role: 'buyer' | 'store' | 'delivery' | 'admin';
  name: string;
  email: string;
  phoneNumber?: string; 
  displayName?: string;
  profileImageUrl?: string;
  
  storeId?: string; 
  addresses?: { 
      id: string; 
      street: string; 
      city: string; 
      zipCode: string; 
  }[];
  favoriteStores?: string[];
  favoriteProducts?: string[];
  isApproved?: boolean; 
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  isAdmin: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ FUNCIÓN NUEVA: Solicitar permiso y guardar Token
  const registerPushNotifications = async (uid: string) => {
    try {
        // 1. Verificar si el navegador soporta notificaciones y si messaging está inicializado
        if (!('serviceWorker' in navigator) || !messaging) {
            console.log("🔕 Este navegador no soporta notificaciones Push.");
            return;
        }

        // 2. Pedir permiso al usuario
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log("🔕 Permiso de notificaciones denegado.");
            return;
        }

        // 3. Obtener el Token (Identificador del celular/PC)
        // IMPORTANTE: Lo ideal es tener un VAPID Key en .env, pero a veces funciona sin él en desarrollo.
        const currentToken = await getToken(messaging, {
            vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY 
        });

        if (currentToken) {
            console.log("🔔 Token FCM Obtenido:", currentToken);
            
            // 4. Guardar en la base de datos del usuario
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, {
                fcmToken: currentToken,          // Para compatibilidad simple
                fcmTokens: arrayUnion(currentToken) // Para soporte multi-dispositivo
            });
        }
    } catch (error) {
        console.error("❌ Error configurando notificaciones:", error);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
        // @ts-ignore
        const initialToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;
        if (initialToken) {
            try {
                await signInWithCustomToken(auth, initialToken);
            } catch (e) {
                console.error("Error con token inicial:", e);
            }
        }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        // Si el email aún no fue verificado, intentamos recargar el estado
        // para detectar si el usuario ya hizo click en el link de verificación
        if (!currentUser.emailVerified) {
            currentUser.reload().catch(() => {});
        }

        registerPushNotifications(currentUser.uid);

        const profileRef = doc(db, 'users', currentUser.uid);
        
        const unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile({ ...docSnap.data() as UserProfile, id: docSnap.id });
          } else {
            setUserProfile({
                id: currentUser.uid,
                role: 'buyer',
                name: currentUser.displayName || 'Usuario',
                email: currentUser.email || '',
                displayName: currentUser.displayName || 'Usuario',
                profileImageUrl: currentUser.photoURL || '',
            });
          }
          setLoading(false);
        }, (error) => {
           console.error("Error fetching profile:", error);
           setLoading(false);
        });
        
        return () => unsubscribeProfile();
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const isAdmin = userProfile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

// ✅ FIX: Agregamos el tipo de retorno explícito ': AuthContextType'
export const useAuth = (): AuthContextType => useContext(AuthContext);