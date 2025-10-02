
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { prototypeUsers } from '@/lib/placeholder-data';

interface UserProfile {
    uid: string;
    name: string;
    email: string;
    role: 'buyer' | 'store' | 'delivery' | 'admin';
    storeId?: string;
    [key: string]: any;
}

interface AuthContextType {
    user: UserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    loginForPrototype: (email: string, storeId?: string) => Promise<void>; 
    logoutForPrototype: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);


const PROTOTYPE_SESSION_KEY = 'prototypeUserEmail';


export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
      // This effect runs only once on the client after initial render
      setIsClient(true);
    }, []);

    const fetchUserProfile = async (firebaseUser: FirebaseUser) => {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const userData = userDoc.data();
            const profileToSet: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email!,
                ...userData
            } as UserProfile;
            
            if (profileToSet.role === 'store' && !profileToSet.storeId) {
                const storesRef = collection(db, 'stores');
                const q = query(storesRef, where('ownerId', '==', firebaseUser.uid));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    profileToSet.storeId = querySnapshot.docs[0].id;
                }
            }
            setUser(profileToSet);
        } else {
            setUser(null);
        }
    }
    
    const loginForPrototype = async (email: string, newStoreId?: string) => {
        const protoUser = Object.values(prototypeUsers).find(u => u.email === email);
        if (protoUser) {
            sessionStorage.setItem(PROTOTYPE_SESSION_KEY, email);
            
            const sessionStoreIdKey = `proto_store_id_${protoUser.uid}`;
            let finalStoreId: string | undefined = newStoreId || protoUser.storeId;

            if (finalStoreId) {
                // If a new storeId is provided (e.g. on creation) or exists on the base user, it's the source of truth and we save it.
                sessionStorage.setItem(sessionStoreIdKey, finalStoreId);
            } else {
                // On subsequent logins without a new ID, try to retrieve the existing one from the session.
                finalStoreId = sessionStorage.getItem(sessionStoreIdKey) || undefined;
            }

            const userProfile: UserProfile = {
                uid: protoUser.uid,
                name: protoUser.name,
                email: protoUser.email,
                role: protoUser.role,
                storeId: finalStoreId,
            };
            setUser(userProfile);
        }
    };
    
    const logoutForPrototype = () => {
        const prototypeEmail = sessionStorage.getItem(PROTOTYPE_SESSION_KEY);
        if (prototypeEmail) {
            const protoUser = Object.values(prototypeUsers).find(u => u.email === prototypeEmail);
            if (protoUser) {
                 // Do not remove the store id, so it can be retrieved on next login
                 // sessionStorage.removeItem(`proto_store_id_${protoUser.uid}`);
            }
        }
        sessionStorage.removeItem(PROTOTYPE_SESSION_KEY);
        setUser(null);
    }

    useEffect(() => {
        // Only run auth logic on the client
        if (!isClient) {
            return;
        }

        const prototypeEmail = sessionStorage.getItem(PROTOTYPE_SESSION_KEY);
        if (prototypeEmail) {
            loginForPrototype(prototypeEmail).finally(() => setLoading(false));
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
            if (firebaseUser) {
                await fetchUserProfile(firebaseUser);
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        // If no user is found after a short delay (for firebase to init), stop loading
        const timer = setTimeout(() => {
            if (auth.currentUser === null) {
                setLoading(false);
            }
        }, 500);

        return () => {
            unsubscribe();
            clearTimeout(timer);
        };
    }, [isClient]);

    const isAdmin = user?.role === 'admin';

    // The context value now depends on isClient to prevent hydration mismatch
    const value = { 
        user: isClient ? user : null, 
        loading: loading || !isClient, // Stay in loading state until client is mounted
        isAdmin: isClient ? isAdmin : false, 
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
