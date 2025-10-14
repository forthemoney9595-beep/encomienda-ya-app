'use client';

import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { createUserProfile } from '@/lib/user-service';

export default function AdminAuthGuard({ children }: { children: React.ReactNode }) {
    const { user, userProfile, isAdmin, loading } = useAuth();
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
        
        // This is the auto-promotion logic.
        // If the user is the special admin email and their profile isn't admin yet, we create/update it.
        const setupAdminIfNeeded = async () => {
            if (user.email === 'admin@test.com' && firestore && !isAdmin) {
                 try {
                    console.log(`Promoting ${user.email} to admin...`);
                    // This function will create or merge the profile with the admin role.
                    await createUserProfile(firestore, user.uid, { 
                        name: userProfile?.name || 'Admin',
                        email: user.email,
                        role: 'admin' 
                    });
                    // The onSnapshot listener in AuthContext will automatically pick up this change
                    // and update the isAdmin state, triggering a re-render.
                } catch (e) {
                     console.error("Failed to auto-promote admin:", e);
                }
            }
        };

        setupAdminIfNeeded();

        // After attempting promotion, if the user is still not an admin, redirect them.
        // The `isAdmin` flag comes from the context, which is reactive to Firestore changes.
        if (!isAdmin) {
             router.push('/');
        }

    }, [user, isAdmin, userProfile, loading, router, firestore]);

    // While loading or if not an admin yet, show a loading state.
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
