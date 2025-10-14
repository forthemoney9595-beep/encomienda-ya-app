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

        // Listener for the main user profile
        const userDocRef = doc(firestore, 'users', user.uid);
        const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const profile = docSnap.data() as UserProfile;
                setUserProfile(profile);
                // Also set admin status from role if available here
                if (profile.role === 'admin') {
                    setIsAdmin(true);
                }
            } else {
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

        // Separate check for admin role, this is crucial
        const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
        const unsubscribeAdmin = onSnapshot(adminRoleRef, (docSnap) => {
            // If the document exists, user is an admin, regardless of the userProfile role
            if (docSnap.exists()) {
                setIsAdmin(true);
            }
            // If we have listeners for both, we can consider loading complete
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
            setUserProfile(null);
            setIsAdmin(false);
        }
    }, [auth]);

    const loading = isAuthLoading || isProfileLoading;
    
    // Final check for isAdmin: userProfile might have the role, or the roles_admin check passed.
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
