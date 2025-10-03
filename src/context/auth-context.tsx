
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, type Firestore } from 'firebase/firestore';
import { useAuthInstance, useFirestore } from '@/firebase';
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
    const [user, setUser] = useState<AppUserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const auth = useAuthInstance();
    const db = useFirestore();

    const fetchUserProfile = useCallback(async (firebaseUser: FirebaseUser, prototypeProfileEmail?: string | null): Promise<AppUserProfile | null> => {
        // If in prototype mode, load the selected prototype profile.
        if (prototypeProfileEmail) {
            const protoUser = Object.values(prototypeUsers).find(u => u.email === prototypeProfileEmail);
            if (protoUser) {
                return {
                    ...protoUser,
                    // IMPORTANT: The UID from the *actual* anonymous Firebase user is used.
                    // But for prototype data matching, we often use the static prototype UID.
                    // Let's keep the prototype UID for consistency with data, but know the real auth UID is different.
                    uid: protoUser.uid, // Keep the static prototype UID for data lookups
                    // storeId will be loaded from context
                };
            }
        }
        
        // Real user logic
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
        try {
            await signInAnonymously(auth);
            // After anonymous sign-in, onAuthStateChanged will fire.
            // We store the *chosen profile* to be picked up by the auth state change handler.
            sessionStorage.setItem(PROTOTYPE_PROFILE_KEY, email);
        } catch (error) {
            console.error("Error signing in anonymously for prototype:", error);
        }
    }, [auth]);

    const logoutForPrototype = useCallback(async () => {
        sessionStorage.removeItem(PROTOTYPE_PROFILE_KEY);
        if (auth.currentUser) {
            await auth.signOut();
        }
        setUser(null);
    }, [auth]);

    useEffect(() => {
        setLoading(true);
        
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const prototypeProfileEmail = sessionStorage.getItem(PROTOTYPE_PROFILE_KEY);
                const profile = await fetchUserProfile(firebaseUser, prototypeProfileEmail);

                if (profile?.role === 'store' && profile.storeId) {
                    const sessionStoreIdKey = `proto_store_id_${profile.uid}`;
                    sessionStorage.setItem(sessionStoreIdKey, profile.storeId);
                }

                setUser(profile);

            } else {
                // Not logged into Firebase, so no user.
                setUser(null);
                 sessionStorage.removeItem(PROTOTYPE_PROFILE_KEY);
            }
            setLoading(false);
        });
        
        return () => unsubscribe();
    }, [auth, fetchUserProfile]);

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
