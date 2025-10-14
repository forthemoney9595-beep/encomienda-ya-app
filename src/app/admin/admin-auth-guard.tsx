'use client';

import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

async function ensureAdminProfile(firestore: any, user: any) {
    if (!firestore || !user) return;

    // This is the definitive check. If the user is an admin, ensure their
    // profile in the 'users' collection reflects that.
    const userRef = doc(firestore, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        // If the admin has no user profile at all, create one.
        await setDoc(userRef, {
            uid: user.uid,
            name: user.displayName || 'Admin User',
            email: user.email,
            role: 'admin',
        });
    } else {
        // If the profile exists but doesn't have the admin role, update it.
        const userData = userSnap.data();
        if (userData.role !== 'admin') {
            await setDoc(userRef, { role: 'admin' }, { merge: true });
        }
    }
}


export default function AdminAuthGuard({ children }: { children: React.ReactNode }) {
    const { user, isAdmin, loading } = useAuth();
    const router = useRouter();
    const firestore = useFirestore();

    useEffect(() => {
        if (loading) {
            return; // Wait until loading is complete
        }

        if (!user) {
            router.push('/login'); // Not logged in, redirect to login
            return;
        }

        // If the user is loaded and IS an admin, ensure their profile is correct
        if (isAdmin) {
            ensureAdminProfile(firestore, user);
        } else {
            // If the user is loaded and is NOT an admin, redirect them.
            router.push('/');
        }

    }, [user, isAdmin, loading, router, firestore]);

    // While loading or if the user is not an admin yet, show a loading screen.
    if (loading || !isAdmin) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-muted-foreground">Verificando permisos de administrador...</p>
                </div>
            </div>
        );
    }

    // If all checks pass, render the protected content.
    return <>{children}</>;
}
