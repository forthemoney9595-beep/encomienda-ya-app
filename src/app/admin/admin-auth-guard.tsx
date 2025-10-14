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
            return; // Esperar hasta que la carga termine
        }

        if (!user) {
            router.push('/login'); // No ha iniciado sesión, redirigir al login
            return;
        }

        if (!isAdmin) {
            // El usuario está cargado y NO es admin, redirigir a la página principal
            router.push('/');
        }
        // Si es admin, no hacer nada y permitir el renderizado

    }, [user, isAdmin, loading, router]);

    // Mientras se carga o si el usuario aún no está verificado como administrador, mostrar una pantalla de carga.
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

    // Si todas las verificaciones pasan, renderizar el contenido protegido.
    return <>{children}</>;
}
