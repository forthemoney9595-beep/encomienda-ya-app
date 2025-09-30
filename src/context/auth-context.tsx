'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

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

    const fetchUserProfile = async (firebaseUser: FirebaseUser | null, prototypeEmail?: string | null) => {
        setLoading(true);
        let profileToSet: UserProfile | null = null;
        if (firebaseUser) {
            sessionStorage.removeItem(PROTOTYPE_SESSION_KEY);
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                 profileToSet = {
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
            }
        } else if (prototypeEmail) {
            const userQuery = query(collection(db, "users"), where("email", "==", prototypeEmail));
            const querySnapshot = await getDocs(userQuery);
            if (!querySnapshot.empty) {
                const userDoc = querySnapshot.docs[0];
                const userData = userDoc.data();
                profileToSet = {
                    uid: userDoc.id,
                    ...userData
                } as UserProfile;

                if (profileToSet.role === 'store') {
                     const storesRef = collection(db, 'stores');
                    const q = query(storesRef, where('ownerId', '==', userDoc.id));
                    const storeQuerySnapshot = await getDocs(q);
                    if (!storeQuerySnapshot.empty) {
                        profileToSet.storeId = storeQuerySnapshot.docs[0].id;
                    }
                }
            }
        }
        
        setUser(profileToSet);
        setLoading(false);
    }

    const loginForPrototype = async (email: string) => {
        sessionStorage.setItem(PROTOTYPE_SESSION_KEY, email);
        // Force fetch the profile immediately after setting the session storage
        await fetchUserProfile(null, email);
    };

    const logoutForPrototype = () => {
        sessionStorage.removeItem(PROTOTYPE_SESSION_KEY);
        setUser(null);
    }

    useEffect(() => {
        const prototypeEmail = sessionStorage.getItem(PROTOTYPE_SESSION_KEY);
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
            // Only fetch based on firebaseUser if no prototype session is active
            if (!sessionStorage.getItem(PROTOTYPE_SESSION_KEY)) {
                await fetchUserProfile(firebaseUser, null);
            }
        });

        // Initial check on mount
        fetchUserProfile(auth.currentUser, prototypeEmail);

        return () => unsubscribe();
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
