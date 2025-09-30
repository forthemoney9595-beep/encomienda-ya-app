'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { initializeFirebase, auth, db } from '@/lib/firebase'; // Import the initializer and services

interface UserProfile {
    uid: string;
    name: string;
    email: string;
    role: 'buyer' | 'store' | 'delivery' | 'admin';
    storeId?: string; // Add storeId for store owners
    [key: string]: any;
}

interface AuthContextType {
    user: UserProfile | null;
    loading: boolean;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const mockAdminUser: UserProfile = {
    uid: 'mock-admin-uid',
    name: 'Admin',
    email: 'admin@test.com',
    role: 'admin',
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Initialize Firebase on the client side. This is the crucial fix.
        initializeFirebase();

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
            if (firebaseUser) {
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
                    // If user exists in Auth but not Firestore, something is wrong.
                    // For now, treat as logged out.
                    setUser(null);
                }
            } else {
                // START OF SIMULATION
                // If no user is logged in, simulate the admin user for demo purposes.
                // This avoids needing to register users manually to test the app.
                console.log("No Firebase user found, simulating Admin user.");
                setUser(mockAdminUser);
                // END OF SIMULATION
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const isAdmin = user?.role === 'admin';

    const value = { user, loading, isAdmin };
    
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
