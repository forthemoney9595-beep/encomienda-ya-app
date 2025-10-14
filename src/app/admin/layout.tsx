
'use client';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createUserProfile } from '@/lib/user-service';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, userProfile, isAdmin, loading } = useAuth();
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
                const userProfileRef = doc(firestore, 'users', user.uid);
                const userProfileSnap = await getDoc(userProfileRef);

                if (!userProfileSnap.exists() || userProfileSnap.data()?.role !== 'admin') {
                     try {
                        await createUserProfile(firestore, user.uid, { 
                            name: 'Admin',
                            email: user.email,
                            role: 'admin' 
                        });
                        // The onSnapshot in AuthContext will handle the state update
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
    }, [user, isAdmin, userProfile, loading, router, firestore]);

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
