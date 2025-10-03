
'use client';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { prototypeUsers } from '@/lib/placeholder-data';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isAdmin, loading } = useAuth();
    const router = useRouter();
    const [isChecking, setIsChecking] = useState(true);
    
    useEffect(() => {
        if (!loading) {
            if (!isAdmin) {
                // Redirect non-admin users away
                router.push('/');
            } else {
                setIsChecking(false);
            }
        }
    }, [user, isAdmin, loading, router]);
    
    if (loading || isChecking) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
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

    