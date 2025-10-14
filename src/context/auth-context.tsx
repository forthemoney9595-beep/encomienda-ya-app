
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useUser, useAuth as useFirebaseAuth, useFirestore, useMemoFirebase } from '@/firebase';
import type { User } from 'firebase/auth';
import type { UserProfile } from '@/lib/placeholder-data';
import { doc, onSnapshot } from 'firebase/firestore';

interface AuthContextType {
    user: User | null;
    userProfile: UserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const { user, isUserLoading: isAuthLoading, userError } = useUser();
    const auth = useFirebaseAuth();
    const firestore = useFirestore();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isProfileLoading, setProfileLoading] = useState(true);

    const userDocRef = useMemoFirebase(() => {
      if (!user?.uid || !firestore) return null;
      return doc(firestore, 'users', user.uid);
    }, [user?.uid, firestore]);

    useEffect(() => {
        if (!userDocRef) {
            setUserProfile(null);
            setProfileLoading(false);
            return;
        }

        setProfileLoading(true);
        const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserProfile(docSnap.data() as UserProfile);
            } else {
                setUserProfile(null);
            }
            setProfileLoading(false);
        }, (error) => {
            console.error("Error fetching user profile:", error);
            setUserProfile(null);
            setProfileLoading(false);
        });

        return () => unsubscribe();
    }, [userDocRef]);


    const logout = useCallback(async () => {
        if(auth) {
            await auth.signOut();
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
