'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { 
    onAuthStateChanged, 
    User, 
    signInWithCustomToken 
} from 'firebase/auth';
import { doc, onSnapshot, updateDoc, arrayUnion, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'; // ✅ Agregamos updateDoc y arrayUnion
import { isSignupInProgress } from '@/lib/signup-flag';
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
  dni?: string; // Repartidor, cargado en /signup/delivery
  birthDate?: string; // Repartidor, cargado en /signup/delivery
  // Nivel de admin (Fase DD): 'support' = acceso operativo (pedidos/reseñas/vista), sin
  // plata/config/broadcast/borrado de cuentas ni poder de promover otros admins. Sin valor
  // (undefined) = 'full', para que los admins creados antes de esta fase no pierdan nada.
  adminLevel?: 'full' | 'support';
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  // Admin con acceso TOTAL (no 'support'). La fuente de verdad real es roles_admin/{uid}.level
  // en el servidor (ver auth-server.ts/firestore.rules) -- esto es solo para decidir qué
  // mostrar/habilitar en la UI, nunca reemplaza la validación server-side.
  isFullAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  isAdmin: false,
  isFullAdmin: false,
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
            return;
        }

        // 2. Pedir permiso al usuario
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            return;
        }

        // 3. Obtener el Token (Identificador del celular/PC)
        // IMPORTANTE: Lo ideal es tener un VAPID Key en .env, pero a veces funciona sin él en desarrollo.
        const currentToken = await getToken(messaging, {
            vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY 
        });

        if (currentToken) {
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
            // Alguien se autenticó (típicamente login con Google) pero todavía no tiene
            // perfil en Firestore -- antes acá solo se simulaba un perfil en memoria sin
            // escribir nada, así que la cuenta quedaba "a medias": no podía guardar
            // cambios en /profile (updateDoc falla si el documento no existe) y cualquier
            // lugar del server que espera users/{uid} podía fallar en silencio. Ahora se
            // crea de verdad como comprador (mismo rol por defecto que el signup normal
            // de /signup/buyer) -- este onSnapshot se va a disparar de nuevo solo, con
            // docSnap.exists() en true, una vez que el setDoc se complete.
            // 🚨 ANTI-CARRERA (Fase RR quinquies): durante un SIGNUP este fallback
            // competía con el batch del registro — si ganaba, el batch pasaba de create
            // a update con campos prohibidos y las reglas lo rechazaban (el usuario veía
            // "ese teléfono ya tiene cuenta" y quedaba un doc huérfano por intento).
            // El signup crea el perfil él mismo: acá no se escribe nada mientras corre.
            if (isSignupInProgress()) return;

            const fallbackProfile: UserProfile = {
                id: currentUser.uid,
                role: 'buyer',
                name: currentUser.displayName || 'Usuario',
                email: currentUser.email || '',
                displayName: currentUser.displayName || 'Usuario',
                profileImageUrl: currentUser.photoURL || '',
                addresses: [],
            };
            setUserProfile(fallbackProfile);
            // Segunda defensa: esperar un momento y RE-CHEQUEAR antes de escribir — si
            // otro flujo está creando el perfil en este mismo instante (una pestaña
            // duplicada, un flujo futuro), el getDoc fresco lo ve y no pisamos nada.
            setTimeout(async () => {
                try {
                    if (isSignupInProgress()) return;
                    const fresh = await getDoc(profileRef);
                    if (fresh.exists()) return;
                    await setDoc(profileRef, {
                        uid: currentUser.uid,
                        role: 'buyer',
                        name: currentUser.displayName || 'Usuario',
                        email: currentUser.email || '',
                        displayName: currentUser.displayName || 'Usuario',
                        profileImageUrl: currentUser.photoURL || '',
                        addresses: [],
                        createdAt: serverTimestamp(),
                    });
                } catch (err) {
                    console.error('Error creando perfil para login social:', err);
                }
            }, 2500);
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
  const isFullAdmin = isAdmin && userProfile?.adminLevel !== 'support';

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, isAdmin, isFullAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

// ✅ FIX: Agregamos el tipo de retorno explícito ': AuthContextType'
export const useAuth = (): AuthContextType => useContext(AuthContext);