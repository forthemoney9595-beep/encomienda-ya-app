
'use client';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
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

        if (!user) {
            router.push('/login');
            return;
        }
        
        // Auto-promotion for a specific admin email
        const setupAdmin = async () => {
            if (user.email === 'admin@test.com' && firestore) {
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
                        // The onSnapshot in AuthContext will handle the isAdmin state update
                    } catch (e) {
                         console.error("Failed to auto-promote admin:", e);
                    }
                }
            }
        };

        setupAdmin();

        if (!isAdmin) {
             router.push('/');
        }
    }, [user, isAdmin, loading, router, firestore]);

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

    return <>{children}</>;
}
