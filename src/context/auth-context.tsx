
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { prototypeUsers } from '@/lib/placeholder-data';
import type { UserProfile as AppUserProfile } from '@/lib/user';

interface AuthContextType {
    user: AppUserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    loginForPrototype: (email: string) => Promise<void>; 
    logoutForPrototype: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROTOTYPE_SESSION_KEY = 'prototypeUserEmail';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<AppUserProfile | null>(null);
    const [loading, setLoading] = useState(true);

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
                const storesRef = collection(db, 'stores');
                const q = query(storesRef, where('ownerId', '==', firebaseUser.uid));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    profileToSet.storeId = querySnapshot.docs[0].id;
                }
            }
            return profileToSet;
        }
        return null;
    }, []);

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
    }, [fetchUserProfile, loginForPrototype]);

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
