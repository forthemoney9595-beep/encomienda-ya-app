'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { prototypeUsers } from '@/lib/placeholder-data';
import type { UserProfile as AppUserProfile } from '@/lib/user';

interface AuthContextType {
    user: AppUserProfile | null;
    loading: boolean;
    isAdmin: boolean;
    loginForPrototype: (email: string) => void;
    logoutForPrototype: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROTOTYPE_USER_KEY = 'prototypeUserEmail';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<AppUserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (isClient) {
            try {
                const savedUserEmail = sessionStorage.getItem(PROTOTYPE_USER_KEY);
                if (savedUserEmail && prototypeUsers[savedUserEmail]) {
                    setUser(prototypeUsers[savedUserEmail]);
                }
            } catch (error) {
                console.error("Failed to parse user from sessionStorage", error);
                sessionStorage.removeItem(PROTOTYPE_USER_KEY);
            } finally {
                setLoading(false);
            }
        }
    }, [isClient]);

    const loginForPrototype = (email: string) => {
        if (prototypeUsers[email]) {
            const userToLogin = prototypeUsers[email];
            setUser(userToLogin);
            sessionStorage.setItem(PROTOTYPE_USER_KEY, email);
        }
    };

    const logoutForPrototype = () => {
        setUser(null);
        sessionStorage.removeItem(PROTOTYPE_USER_KEY);
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
