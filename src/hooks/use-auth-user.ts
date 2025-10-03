
'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signInAnonymously } from 'firebase/auth';
import { useAuthInstance } from '@/firebase/provider';

export interface AuthUserHookResult {
    user: FirebaseUser | null;
    isUserLoading: boolean;
    userError: Error | null;
}

const PROTOTYPE_PROFILE_KEY = 'prototypeUserProfile';

export const useAuthUser = (): AuthUserHookResult => {
    const auth = useAuthInstance();
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [isUserLoading, setUserLoading] = useState(true);
    const [userError, setUserError] = useState<Error | null>(null);

    useEffect(() => {
        if (!auth) {
            setUserLoading(false);
            setUserError(new Error("Auth service not available."));
            return;
        }

        const handleAuthChange = async (firebaseUser: FirebaseUser | null) => {
            const prototypeProfileEmail = sessionStorage.getItem(PROTOTYPE_PROFILE_KEY);

            if (firebaseUser) {
                // A user is logged in (real or anonymous)
                setUser(firebaseUser);
            } else if (prototypeProfileEmail) {
                // No user is logged in, but we want to be a prototype user
                // Sign in anonymously, and the onAuthStateChanged will re-trigger
                try {
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Anonymous sign-in failed", error);
                    setUserError(error as Error);
                }
            } else {
                // No user, and not in prototype mode
                setUser(null);
            }
            setUserLoading(false);
        };

        const unsubscribe = onAuthStateChanged(auth, handleAuthChange, (error) => {
            console.error("Auth state listener error:", error);
            setUserError(error);
            setUserLoading(false);
        });

        return () => unsubscribe();
    }, [auth]);

    return { user, isUserLoading, userError };
};
