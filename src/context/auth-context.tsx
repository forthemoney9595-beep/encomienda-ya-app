
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useUser as useFirebaseUserHook, useAuth as useFirebaseAuth, useFirestore, useMemoFirebase } from '@/firebase';
import type { User } from 'firebase/auth';
import type { UserProfile } from '@/lib/user-service';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';

interface AuthContextType {
    user: User | null;
    userProfile: UserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const { user, isUserLoading: isAuthLoading, userError } = useFirebaseUserHook();
    const auth = useFirebaseAuth();
    const firestore = useFirestore();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isProfileLoading, setProfileLoading] = useState(true);

    useEffect(() => {
      const fetchUserProfile = async (uid: string) => {
        if (!firestore) return;
        setProfileLoading(true);
        try {
          const userDocRef = doc(firestore, 'users', uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          } else {
            setUserProfile(null);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setUserProfile(null);
        } finally {
          setProfileLoading(false);
        }
      };

      if (user) {
        fetchUserProfile(user.uid);
      } else {
        setUserProfile(null);
        setProfileLoading(false);
      }
    }, [user, firestore]);

    const logout = useCallback(async () => {
        if(auth) {
            await auth.signOut();
            // User profile will be cleared by the useEffect above
        }
    }, [auth]);

    const isAdmin = userProfile?.role === 'admin';
    const loading = isAuthLoading || isProfileLoading;

    const value = { user, userProfile, loading, isAdmin, logout };
    
    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
