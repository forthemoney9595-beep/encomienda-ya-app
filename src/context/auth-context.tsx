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
    loginForPrototype: (email: string) => Promise<void>; 
    logoutForPrototype: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);


const PROTOTYPE_SESSION_KEY = 'prototypeUserEmail';


export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const loginForPrototype = async (email: string) => {
        sessionStorage.setItem(PROTOTYPE_SESSION_KEY, email);
    };

    const logoutForPrototype = () => {
        sessionStorage.removeItem(PROTOTYPE_SESSION_KEY);
        setUser(null);
    }
    
    const fetchUserProfile = async (firebaseUser: FirebaseUser | null, prototypeEmail?: string | null) => {
        if (firebaseUser) {
            sessionStorage.removeItem(PROTOTYPE_SESSION_KEY);
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                let profile: UserProfile = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email!,
                    ...userData
                } as UserProfile;
                
                if (profile.role === 'store') {
                    const storesRef = collection(db, 'stores');
                    const q = query(storesRef, where('ownerId', '==', firebaseUser.uid));
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        profile.storeId = querySnapshot.docs[0].id;
                    }
                }
                setUser(profile);
            } else {
                setUser(null); // User exists in Auth but not in Firestore profiles
            }
        } else if (prototypeEmail && prototypeUsers[prototypeEmail]) {
            let protoUser = { ...prototypeUsers[prototypeEmail] };
            
            // If the proto user is a store, we need to find its storeId from the database
            if (protoUser.role === 'store') {
                const storesRef = collection(db, 'stores');
                const q = query(storesRef, where('ownerId', '==', protoUser.uid));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    protoUser.storeId = querySnapshot.docs[0].id;
                    protoUser.storeName = querySnapshot.docs[0].data().name;
                } else {
                    // This can happen if the store is not yet created. For prototype, we might need a fallback.
                     console.warn(`Prototype store owner ${protoUser.email} has no store in DB.`);
                }
            }
            setUser(protoUser);
        } else {
            setUser(null);
        }
        setLoading(false);
    }

    useEffect(() => {
        const prototypeEmail = sessionStorage.getItem(PROTOTYPE_SESSION_KEY);
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
            await fetchUserProfile(firebaseUser, prototypeEmail);
        });

        // Initial check in case onAuthStateChanged doesn't fire immediately
        if (!auth.currentUser && prototypeEmail) {
            fetchUserProfile(null, prototypeEmail);
        } else if (!auth.currentUser && !prototypeEmail) {
            setLoading(false);
        }


        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === PROTOTYPE_SESSION_KEY) {
                const newPrototypeEmail = sessionStorage.getItem(PROTOTYPE_SESSION_KEY);
                fetchUserProfile(auth.currentUser, newPrototypeEmail);
            }
        };

        window.addEventListener('storage', handleStorageChange);


        return () => {
            unsubscribe();
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    const isAdmin = user?.role === 'admin';

    const value = { user, loading, isAdmin, loginForPrototype, logoutForPrototype };
    
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
