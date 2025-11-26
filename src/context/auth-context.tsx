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
        if (!firestore || !user) {
            setUserProfile(null);
            setIsAdmin(false);
            // If auth has finished loading and there's no user, profile loading is also done.
            if (!isAuthLoading && !user) {
                setProfileLoading(false);
            }
            return;
        }

        setProfileLoading(true);

        const userDocRef = doc(firestore, 'users', user.uid);
        const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserProfile(docSnap.data() as UserProfile);
            } else {
                 setUserProfile({
                    uid: user.uid,
                    email: user.email!,
                    name: user.displayName || 'Nuevo Usuario',
                    role: 'buyer'
                 });
            }
            // Profile is loaded, now check admin status
            const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
            getDoc(adminRoleRef).then(adminSnap => {
                setIsAdmin(adminSnap.exists());
            }).finally(() => {
                setProfileLoading(false); // Finished loading profile and admin status
            });

        }, (error) => {
            console.error("Error fetching user profile:", error);
            setUserProfile(null);
            setIsAdmin(false);
            setProfileLoading(false);
        });

        return () => {
            unsubscribeUser();
        };

    }, [user, firestore, isAuthLoading]);

    const logout = useCallback(async () => {
        if(auth) {
            await auth.signOut();
            // Reset state on logout
            setUserProfile(null);
            setIsAdmin(false);
            setProfileLoading(false);
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
