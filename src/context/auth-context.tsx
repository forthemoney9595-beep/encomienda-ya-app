'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { 
    onAuthStateChanged, 
    User, 
    signInWithCustomToken 
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
// ✅ Importamos las instancias compartidas desde @/lib/firebase
import { auth, db } from '@/lib/firebase';

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

// ✅ FIX: Agregamos el tipo de retorno explícito ': AuthContextType' para eliminar el error de inferencia
export const useAuth = (): AuthContextType => useContext(AuthContext);