
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, type Firestore } from 'firebase/firestore';
import { useAuthInstance, useFirestore } from '@/firebase';
import { prototypeUsers } from '@/lib/placeholder-data';
import type { UserProfile as AppUserProfile } from '@/lib/user';
import { getStores } from '@/lib/data-service';

interface AuthContextType {
    user: AppUserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    loginForPrototype: (email: string) => Promise<void>; 
    logoutForPrototype: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROTOTYPE_SESSION_KEY = 'prototypeUserEmail';

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
    const [user, setUser] = useState<AppUserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const auth = useAuthInstance();
    const db = useFirestore();

    const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser): Promise<AppUserProfile | null> => {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const userData = userDoc.data();
            const profileToSet: AppUserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email!,
                ...userData
            } as AppUserProfile;
            
            if (profileToSet.role === 'store' && !profileToSet.storeId) {
                 profileToSet.storeId = await fetchUserStoreId(db, firebaseUser.uid);
            }
            return profileToSet;
        }
        return null;
    }, [db]);

    const loginForPrototype = useCallback(async (email: string) => {
        const protoUser = Object.values(prototypeUsers).find(u => u.email === email);
        if (protoUser) {
            sessionStorage.setItem(PROTOTYPE_SESSION_KEY, email);
            
            const sessionStoreIdKey = `proto_store_id_${protoUser.uid}`;
            let finalStoreId: string | undefined = protoUser.storeId;

            if (!finalStoreId) {
                finalStoreId = sessionStorage.getItem(sessionStoreIdKey) || undefined;
            } else {
                 sessionStorage.setItem(sessionStoreIdKey, finalStoreId);
            }

            const userProfile: AppUserProfile = {
                ...protoUser,
                storeId: finalStoreId,
            };
            setUser(userProfile);
        } else {
            setUser(null);
        }
    }, []);

    const logoutForPrototype = useCallback(() => {
        sessionStorage.removeItem(PROTOTYPE_SESSION_KEY);
        setUser(null);
    }, []);

    useEffect(() => {
        setLoading(true);
        const prototypeEmail = sessionStorage.getItem(PROTOTYPE_SESSION_KEY);

        if (prototypeEmail) {
            loginForPrototype(prototypeEmail).finally(() => setLoading(false));
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const profile = await fetchUserProfile(firebaseUser);
                setUser(profile);
            } else {
                setUser(null);
            }
            setLoading(false);
        });
        
        return () => unsubscribe();
    }, [fetchUserProfile, loginForPrototype, auth]);

    const isAdmin = user?.role === 'admin';

    const value = { 
        user, 
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
