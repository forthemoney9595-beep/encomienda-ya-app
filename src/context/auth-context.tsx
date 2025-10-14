
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useUser as useFirebaseUserHook, useAuth as useFirebaseAuth, useFirestore } from '@/firebase';
import type { User } from 'firebase/auth';
import type { UserProfile } from '@/lib/user-service';
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
    const { user, isUserLoading: isAuthLoading } = useFirebaseUserHook();
    const auth = useFirebaseAuth();
    const firestore = useFirestore();
    
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isProfileLoading, setProfileLoading] = useState(true);

    useEffect(() => {
        if (!user || !firestore) {
            setUserProfile(null);
            setProfileLoading(false);
            return;
        }

        setProfileLoading(true);
        const userDocRef = doc(firestore, 'users', user.uid);

        const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserProfile(docSnap.data() as UserProfile);
            } else {
                console.log(`No user profile found for UID: ${user.uid}`);
                setUserProfile(null);
            }
            setProfileLoading(false);
        }, (error) => {
            console.error("Error fetching user profile with onSnapshot:", error);
            setUserProfile(null);
            setProfileLoading(false);
        });

        // Cleanup subscription on unmount or when user changes
        return () => unsubscribe();

    }, [user, firestore]);

    const logout = useCallback(async () => {
        if(auth) {
            await auth.signOut();
            // The useEffect above will handle clearing the userProfile state
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
