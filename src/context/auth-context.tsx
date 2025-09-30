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

    const fetchUserProfile = async (firebaseUser: FirebaseUser | null) => {
        setLoading(true);
        if (firebaseUser) {
             // Logic for real Firebase user
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                const profileToSet: UserProfile = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email!,
                    ...userData
                } as UserProfile;
                
                if (profileToSet.role === 'store') {
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
        } else {
            setUser(null);
        }
        setLoading(false);
    }
    
    const loginForPrototype = async (email: string) => {
        const protoUser = Object.values(prototypeUsers).find(u => u.email === email);
        if (protoUser) {
            sessionStorage.setItem(PROTOTYPE_SESSION_KEY, email);
            const userProfile: UserProfile = {
                uid: protoUser.uid,
                name: protoUser.name,
                email: protoUser.email,
                role: protoUser.role,
                storeId: protoUser.storeId
            };
            setUser(userProfile);
        }
    };

    const logoutForPrototype = () => {
        sessionStorage.removeItem(PROTOTYPE_SESSION_KEY);
        setUser(null);
    }

    useEffect(() => {
        const prototypeEmail = sessionStorage.getItem(PROTOTYPE_SESSION_KEY);
        if (prototypeEmail) {
            loginForPrototype(prototypeEmail).finally(() => setLoading(false));
        } else {
            const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
                await fetchUserProfile(firebaseUser);
            });
            return () => unsubscribe();
        }
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
