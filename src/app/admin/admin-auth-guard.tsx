'use client';

import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';

// requireFullAdmin: para secciones sensibles (finanzas, config, comunicaciones) que un
// admin nivel 'support' no debería poder ver ni por URL directa, aunque el link ya esté
// oculto del menú (ver main-nav.tsx). El guardado real de estos datos siempre está además
// en firestore.rules/las API routes -- esto es defensa en profundidad del lado UI.
export default function AdminAuthGuard({ children, requireFullAdmin }: { children: React.ReactNode; requireFullAdmin?: boolean }) {
    const { user, isAdmin, isFullAdmin, loading } = useAuth();
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
        // Si es admin, no hacer nada y permitir el renderizado (salvo el caso
        // requireFullAdmin, que se maneja en el render de abajo con un mensaje propio)

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

    if (requireFullAdmin && !isFullAdmin) {
        return (
            <div className="flex items-center justify-center h-screen px-4">
                <div className="flex flex-col items-center gap-2 text-center max-w-sm">
                    <ShieldAlert className="h-12 w-12 text-warning" />
                    <h2 className="font-semibold text-lg">Sección no disponible</h2>
                    <p className="text-sm text-muted-foreground">
                        Tu cuenta tiene acceso de soporte (operativo). Esta sección requiere un
                        administrador con acceso completo.
                    </p>
                </div>
            </div>
        );
    }

    // Si todas las verificaciones pasan, renderizar el contenido protegido.
    return <>{children}</>;
}
