
'use client';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFirestore } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isAdmin, loading } = useAuth();
    const router = useRouter();
    const firestore = useFirestore();

    useEffect(() => {
        if (loading) {
            return;
        }

        if (!user || !firestore) {
            router.push('/login');
            return;
        }
        
        // This is the auto-promotion logic.
        // It checks if the logged-in user is 'admin@test.com' and if their admin role document exists.
        // If not, it creates it.
        const setupAdmin = async () => {
            if (user.email === 'admin@test.com') {
                const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
                const adminSnap = await getDoc(adminRoleRef);
                if (!adminSnap.exists()) {
                    try {
                        await setDoc(adminRoleRef, {
                            name: 'Admin',
                            email: user.email,
                            role: 'superadmin',
                            createdAt: new Date(),
                        });
                        // After setting, the context's onSnapshot should update isAdmin,
                        // triggering a re-render and granting access.
                    } catch (e) {
                         console.error("Failed to auto-promote admin:", e);
                    }
                }
            }
        };

        setupAdmin().then(() => {
            // After attempting to set up, check for admin status.
            // A brief delay can help ensure the context has time to receive the update.
            setTimeout(() => {
                if (!isAdmin) {
                     // Re-check isAdmin from context after potential update
                    const { isAdmin: updatedIsAdmin } = useAuth.getState ? useAuth.getState() : { isAdmin: false };
                    if(!updatedIsAdmin) {
                        // router.push('/');
                    }
                }
            }, 500)
        });

    }, [user, isAdmin, loading, router, firestore]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-muted-foreground">Verificando permisos de administrador...</p>
                </div>
            </div>
        );
    }
    
    if (!isAdmin) {
        return (
            <div className="container mx-auto mt-10">
                 <Alert variant="destructive">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Acceso Denegado</AlertTitle>
                    <AlertDescription>
                        No tienes permisos para acceder a esta área. Serás redirigido en breve...
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return <>{children}</>;
}
