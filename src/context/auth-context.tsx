
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { doc, getDoc, collection, query, where, getDocs, type Firestore } from 'firebase/firestore';
import { useFirestore, useAuthInstance } from '@/firebase';
import { prototypeUsers } from '@/lib/placeholder-data';
import type { UserProfile as AppUserProfile } from '@/lib/user';
import { useAuthUser } from '@/hooks/use-auth-user';
import { User as FirebaseUser, signInAnonymously } from 'firebase/auth';
import { useRouter } from 'next/navigation';

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
    const auth = useAuthInstance();
    const router = useRouter();

    const fetchAppUserProfile = useCallback(async (fbUser: FirebaseUser): Promise<AppUserProfile | null> => {
        const prototypeProfileEmail = sessionStorage.getItem(PROTOTYPE_PROFILE_KEY);
        
        if (prototypeProfileEmail && fbUser.isAnonymous) {
            const protoUser = Object.values(prototypeUsers).find(u => u.email === prototypeProfileEmail);
            if (protoUser) {
                // Return the prototype profile but keep the real anonymous UID
                return { ...protoUser, uid: fbUser.uid };
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
                const profile = await fetchAppUserProfile(firebaseUser);
                setAppUser(profile);
            } else {
                setAppUser(null);
                 if (sessionStorage.getItem(PROTOTYPE_PROFILE_KEY)) {
                    sessionStorage.removeItem(PROTOTYPE_PROFILE_KEY);
                }
            }
            setLoading(false);
        };
        
        manageUser();
    }, [firebaseUser, isAuthUserLoading, fetchAppUserProfile]);

    const loginForPrototype = useCallback(async (email: string) => {
        setLoading(true);
        try {
            await signInAnonymously(auth);
            sessionStorage.setItem(PROTOTYPE_PROFILE_KEY, email);
            router.push('/');
        } catch (error) {
            console.error("Error signing in anonymously for prototype mode:", error);
        } finally {
            setLoading(false);
        }
    }, [auth, router]);

    const logoutForPrototype = useCallback(async () => {
        sessionStorage.removeItem(PROTOTYPE_PROFILE_KEY);
        await auth.signOut();
        router.push('/login');
    }, [auth, router]);

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
