'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { 
    getAuth, 
    onAuthStateChanged, 
    User, 
    signInAnonymously, 
    signInWithCustomToken 
} from 'firebase/auth';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';

// Definimos la interfaz del perfil
export interface UserProfile {
  // ✅ CORRECCIÓN 1: Agregamos 'id' como propiedad opcional para compatibilidad
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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let app;
    if (!getApps().length) {
        // @ts-ignore
        const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
        app = initializeApp(firebaseConfig);
    } else {
        app = getApp();
    }
    
    const auth = getAuth(app);
    const db = getFirestore(app);

    const initAuth = async () => {
        // @ts-ignore
        const initialToken = typeof __initial_auth_token !== 'undefined' ? __initial_initial_auth_token : undefined;
        if (initialToken) {
            await signInWithCustomToken(auth, initialToken);
        }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const profileRef = doc(db, 'users', currentUser.uid);
        const unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) {
            // ✅ CORRECCIÓN 2: El 'id' ahora es una propiedad conocida de UserProfile
            setUserProfile({ ...docSnap.data() as UserProfile, id: docSnap.id });
          } else {
            setUserProfile({
                id: currentUser.uid, // Aseguramos el ID aquí también
                role: 'buyer',
                name: currentUser.displayName || 'Usuario',
                email: currentUser.email || '',
                displayName: currentUser.displayName || 'Usuario',
                profileImageUrl: '',
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

  return (
    <AuthContext.Provider value={{ user, userProfile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);