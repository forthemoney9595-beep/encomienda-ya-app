
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useUser as useFirebaseUserHook, useAuth as useFirebaseAuth, useFirestore } from '@/firebase';
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
    const { user, isUserLoading: isAuthLoading } = useFirebaseUserHook();
    const auth = useFirebaseAuth();
    const firestore = useFirestore();
    
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isProfileLoading, setProfileLoading] = useState(true);

    useEffect(() => {
        if (isAuthLoading) {
            setProfileLoading(true);
            return;
        }

        if (!user || !firestore) {
            setUserProfile(null);
            setIsAdmin(false);
            setProfileLoading(false);
            return;
        }

        setProfileLoading(true);

        const userDocRef = doc(firestore, 'users', user.uid);
        const adminRoleRef = doc(firestore, 'roles_admin', user.uid);

        const unsubUser = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserProfile(docSnap.data() as UserProfile);
            } else {
                setUserProfile(null); // Explicitly set to null if no profile
            }
        }, (error) => {
            console.error("Error fetching user profile:", error);
            setUserProfile(null);
        });

        const unsubAdmin = onSnapshot(adminRoleRef, (adminSnap) => {
            setIsAdmin(adminSnap.exists());
             // Combine loading states: finish only when both checks are done conceptually
            setProfileLoading(false);
        }, (error) => {
            console.error("Error fetching admin role:", error);
            setIsAdmin(false);
            setProfileLoading(false);
        });

        // Cleanup subscriptions on unmount
        return () => {
            unsubUser();
            unsubAdmin();
        };

    }, [user, firestore, isAuthLoading]);

    const logout = useCallback(async () => {
        if(auth) {
            await auth.signOut();
        }
    }, [auth]);

    const loading = isAuthLoading || isProfileLoading;

    // The final isAdmin check should also consider the userProfile for robustness, though roles_admin is primary
    const finalIsAdmin = isAdmin || userProfile?.role === 'admin';

    const value = { user, userProfile, loading, isAdmin: finalIsAdmin, logout };
    
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
