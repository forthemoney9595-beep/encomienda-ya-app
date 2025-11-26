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
    const { user, isUserLoading: authHookLoading } = useFirebaseUserHook();
    const auth = useFirebaseAuth();
    const firestore = useFirestore();
    
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isProfileLoading, setProfileLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setUserProfile(null);
            setIsAdmin(false);
            setProfileLoading(false); // No user, so profile loading is done.
            return;
        }

        // If user exists, start loading profile
        setProfileLoading(true);

        const userDocRef = doc(firestore, 'users', user.uid);
        const unsubscribeUser = onSnapshot(userDocRef, async (docSnap) => {
            if (docSnap.exists()) {
                const profileData = docSnap.data() as UserProfile;
                setUserProfile(profileData);

                // Admin check can be done in parallel or sequentially.
                // Doing it here ensures it happens after profile is fetched.
                const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
                const adminSnap = await getDoc(adminRoleRef);
                setIsAdmin(adminSnap.exists());
            } else {
                // This case handles brand new users who might not have a profile doc yet.
                setUserProfile(null); 
                setIsAdmin(false);
            }
            // Finished loading profile and admin status for this user
            setProfileLoading(false);
        }, (error) => {
            console.error("Error fetching user profile:", error);
            setUserProfile(null);
            setIsAdmin(false);
            setProfileLoading(false);
        });

        return () => unsubscribeUser();

    }, [user, firestore]);

    const logout = useCallback(async () => {
        if(auth) {
            await auth.signOut();
            // State is reset via the useEffect when `user` becomes null
        }
    }, [auth]);
    
    // The overall loading state is true if the auth hook is loading OR if we have a user but are still fetching their profile.
    const loading = authHookLoading || (!!user && isProfileLoading);
    
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
