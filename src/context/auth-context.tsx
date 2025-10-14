
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
        if (isAuthLoading) {
            setProfileLoading(true);
            return;
        }

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
                // If profile doesn't exist yet (e.g., right after creation),
                // create a temporary one to avoid UI flicker. The real one will arrive shortly.
                 setUserProfile({
                    uid: user.uid,
                    email: user.email!,
                    name: user.displayName || 'Nuevo Usuario',
                    role: 'buyer' // Default role
                 });
            }
            setProfileLoading(false);
        }, (error) => {
            console.error("Error fetching user profile:", error);
            setUserProfile(null);
            setProfileLoading(false);
        });

        return () => unsubscribe();

    }, [user, firestore, isAuthLoading]);

    const logout = useCallback(async () => {
        if(auth) {
            await auth.signOut();
            setUserProfile(null); // Clear profile on logout
        }
    }, [auth]);

    const loading = isAuthLoading || isProfileLoading;
    const isAdmin = userProfile?.role === 'admin';

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
