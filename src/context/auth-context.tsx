
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, User, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { prototypeUsers } from '@/lib/placeholder-data';
import type { UserProfile as AppUserProfile } from '@/lib/user';
import { useAuthInstance, useFirestore } from '@/firebase';

interface AuthContextType {
    user: AppUserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    loginForPrototype: (email: string) => void;
    logoutForPrototype: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROTOTYPE_USER_KEY = 'prototypeUserEmail';

async function fetchUserStoreId(uid: string): Promise<string | undefined> {
    const { firestore } = getFirebase();
    const storesRef = collection(firestore, 'stores');
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
    const [isClient, setIsClient] = useState(false);
    const auth = useAuthInstance();

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!isClient) return;

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
            setLoading(true);
            if (firebaseUser) {
                // If there's a real Firebase user, fetch their profile from Firestore
                const userDocRef = doc(getFirebase().firestore, 'users', firebaseUser.uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const profileToSet: AppUserProfile = {
                        uid: firebaseUser.uid,
                        email: firebaseUser.email!,
                        ...userData
                    } as AppUserProfile;
                    
                    if (profileToSet.role === 'store' && !profileToSet.storeId) {
                         profileToSet.storeId = await fetchUserStoreId(firebaseUser.uid);
                    }
                    setUser(profileToSet);
                } else {
                    // This can happen if user is created but profile is not yet, e.g. during signup
                    setUser(null);
                }
            } else {
                // If no Firebase user, check for a prototype user in session storage
                const prototypeEmail = sessionStorage.getItem(PROTOTYPE_USER_KEY);
                if (prototypeEmail && prototypeUsers[prototypeEmail]) {
                    setUser(prototypeUsers[prototypeEmail]);
                } else {
                    setUser(null);
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isClient, auth]);

    const loginForPrototype = (email: string) => {
        if (prototypeUsers[email]) {
            sessionStorage.setItem(PROTOTYPE_USER_KEY, email);
            setUser(prototypeUsers[email]);
        }
    };

    const logoutForPrototype = async () => {
        await auth.signOut();
        sessionStorage.removeItem(PROTOTYPE_USER_KEY);
        setUser(null);
    };

    const isAdmin = user?.role === 'admin';

    const value = { user, loading: !isClient || loading, isAdmin, loginForPrototype, logoutForPrototype };
    
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
