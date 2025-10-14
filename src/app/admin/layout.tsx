
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
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        if (loading) return;

        const checkAndSetAdminRole = async () => {
            if (!user || !firestore) {
                router.push('/');
                return;
            }

            // This is a special hardcoded check to auto-promote the first admin.
            // In a real app, this would be done via a backend script or manually in the console.
            if (user.email === 'admin@test.com') {
                const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
                const adminSnap = await getDoc(adminRoleRef);
                if (!adminSnap.exists()) {
                    try {
                        await setDoc(adminRoleRef, {
                            name: user.displayName || 'Admin',
                            email: user.email,
                            role: 'superadmin',
                            createdAt: new Date(),
                        });
                        // The onSnapshot listener in AuthContext should pick this up and update isAdmin.
                        // We might need to give it a moment.
                        setTimeout(() => setIsChecking(false), 1000); // Give time for context to update
                    } catch (e) {
                         console.error("Failed to auto-promote admin:", e);
                         router.push('/');
                    }
                } else {
                     if (!isAdmin) {
                        // The role document exists, but the context hasn't updated yet.
                        setTimeout(() => setIsChecking(false), 1000);
                    } else {
                         setIsChecking(false);
                    }
                }
            } else {
                 if (!isAdmin) {
                    router.push('/');
                 } else {
                    setIsChecking(false);
                 }
            }
        };

        checkAndSetAdminRole();

    }, [user, isAdmin, loading, router, firestore]);

    if (loading || isChecking) {
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
                        No tienes permisos para acceder a esta área. Serás redirigido.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return <>{children}</>;
}
