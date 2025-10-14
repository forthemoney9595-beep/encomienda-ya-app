'use client';

import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function AdminAuthGuard({ children }: { children: React.ReactNode }) {
    const { user, isAdmin, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (loading) {
            return; // Wait until loading is complete
        }

        if (!user) {
            router.push('/login'); // Not logged in, redirect to login
            return;
        }

        // If the user is loaded and is not an admin, redirect them.
        if (!isAdmin) {
             router.push('/');
        }

    }, [user, isAdmin, loading, router]);

    // While loading or if the user is not an admin yet, show a loading screen.
    // The `isAdmin` flag comes from the context, which is reactive to Firestore changes.
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
