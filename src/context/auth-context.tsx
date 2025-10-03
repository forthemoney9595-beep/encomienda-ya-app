
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { doc, getDoc, collection, query, where, getDocs, type Firestore } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { prototypeUsers } from '@/lib/placeholder-data';
import type { UserProfile as AppUserProfile } from '@/lib/user';
import { useAuthUser, type AuthUserHookResult } from '@/hooks/use-auth-user';
import { User as FirebaseUser } from 'firebase/auth';

interface AuthContextType {
    user: AppUserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    loginForPrototype: (email: string) => Promise<void>; 
    logoutForPrototype: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROTOTYPE_PROFILE_KEY = 'prototypeUserProfile';

async function fetchUserStoreId(db: Firestore, uid: string): Promise<string | undefined> {
    const storesRef = collection(db, 'stores');
    const q = query(storesRef, where('ownerId', '==', uid));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        return querySnapshot.docs[0].id;
    }
    return undefined;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const { user: firebaseUser, isUserLoading: isAuthUserLoading } = useAuthUser();
    const [appUser, setAppUser] = useState<AppUserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const db = useFirestore();

    const fetchAppUserProfile = useCallback(async (fbUser: FirebaseUser, prototypeProfileEmail?: string | null): Promise<AppUserProfile | null> => {
        if (prototypeProfileEmail) {
            const protoUser = Object.values(prototypeUsers).find(u => u.email === prototypeProfileEmail);
            if (protoUser) {
                return { ...protoUser, uid: protoUser.uid };
            }
        }
        
        const userDocRef = doc(db, 'users', fbUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const userData = userDoc.data();
            const profileToSet: AppUserProfile = {
                uid: fbUser.uid,
                email: fbUser.email!,
                ...userData
            } as AppUserProfile;
            
            if (profileToSet.role === 'store' && !profileToSet.storeId) {
                 profileToSet.storeId = await fetchUserStoreId(db, fbUser.uid);
            }
            return profileToSet;
        }
        return null;
    }, [db]);
    
    useEffect(() => {
        const manageUser = async () => {
            if (isAuthUserLoading) {
                setLoading(true);
                return;
            }

            if (firebaseUser) {
                const prototypeProfileEmail = sessionStorage.getItem(PROTOTYPE_PROFILE_KEY);
                const profile = await fetchAppUserProfile(firebaseUser, prototypeProfileEmail);
                setAppUser(profile);
            } else {
                setAppUser(null);
                sessionStorage.removeItem(PROTOTYPE_PROFILE_KEY);
            }
            setLoading(false);
        };
        
        manageUser();
    }, [firebaseUser, isAuthUserLoading, fetchAppUserProfile]);

    const loginForPrototype = useCallback(async (email: string) => {
        sessionStorage.setItem(PROTOTYPE_PROFILE_KEY, email);
        // This will trigger a reload or context change that useAuthUser will pick up
        // after a new anonymous user is (or isn't) created.
        // For simplicity, we can just reload to re-trigger the auth flow.
        window.location.reload();
    }, []);

    const logoutForPrototype = useCallback(async () => {
        sessionStorage.removeItem(PROTOTYPE_PROFILE_KEY);
        // Let useAuthUser handle the actual signout
        window.location.href = '/login';
    }, []);

    const isAdmin = appUser?.role === 'admin';

    const value = { 
        user: appUser, 
        loading,
        isAdmin, 
        loginForPrototype, 
        logoutForPrototype,
    };
    
    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
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
