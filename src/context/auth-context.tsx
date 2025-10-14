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
        // Reset isAdmin on user change
        setIsAdmin(false);

        // Listener for the main user profile in /users/{uid}
        const userDocRef = doc(firestore, 'users', user.uid);
        const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserProfile(docSnap.data() as UserProfile);
            } else {
                 // If no profile, create a temporary one. The guard might create a real one.
                 setUserProfile({
                    uid: user.uid,
                    email: user.email!,
                    name: user.displayName || 'Nuevo Usuario',
                    role: 'buyer'
                 });
            }
        }, (error) => {
            console.error("Error fetching user profile:", error);
            setUserProfile(null);
        });

        // Separate, definitive check for admin role in /roles_admin/{uid}
        const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
        const unsubscribeAdmin = onSnapshot(adminRoleRef, (docSnap) => {
            setIsAdmin(docSnap.exists());
            // We consider loading complete once the admin check is done, 
            // as it's the most critical for navigation.
            setProfileLoading(false);
        }, (error) => {
            console.error("Error checking admin role:", error);
            setIsAdmin(false);
            setProfileLoading(false);
        });


        return () => {
            unsubscribeUser();
            unsubscribeAdmin();
        };

    }, [user, firestore, isAuthLoading]);

    const logout = useCallback(async () => {
        if(auth) {
            await auth.signOut();
            // State will be cleared by the useEffect hook watching the user object
        }
    }, [auth]);

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
