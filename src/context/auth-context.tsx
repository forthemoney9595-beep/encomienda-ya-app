
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, User, signInWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { prototypeUsers } from '@/lib/placeholder-data';
import type { UserProfile as AppUserProfile } from '@/lib/user';
import { useAuthInstance } from '@/firebase';

interface AuthContextType {
    user: AppUserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    loginForPrototype: (email: string) => void;
    logoutForPrototype: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROTOTYPE_USER_KEY = 'prototypeUserEmail';
const PROTOTYPE_PROFILE_KEY = 'prototypeUserProfile';


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
                
                const prototypeProfileEmail = sessionStorage.getItem(PROTOTYPE_PROFILE_KEY);

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
                } else if (prototypeProfileEmail && prototypeUsers[prototypeProfileEmail]) {
                    // This handles the case where we are in prototype mode with an anonymous user
                    const protoUser = prototypeUsers[prototypeProfileEmail];
                    setUser({
                        ...protoUser,
                        uid: firebaseUser.uid, // Use the REAL anonymous UID
                    });
                }
                else {
                    setUser(null);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isClient, auth]);

    const loginForPrototype = async (email: string) => {
        if (prototypeUsers[email]) {
            try {
                await signInAnonymously(auth);
                // The onAuthStateChanged listener will handle setting the user,
                // after which we can store the desired prototype profile
                sessionStorage.setItem(PROTOTYPE_PROFILE_KEY, email);

            } catch (error) {
                console.error("Anonymous sign-in for prototype failed:", error);
            }
        }
    };

    const logoutForPrototype = async () => {
        await auth.signOut();
        sessionStorage.removeItem(PROTOTYPE_PROFILE_KEY);
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
