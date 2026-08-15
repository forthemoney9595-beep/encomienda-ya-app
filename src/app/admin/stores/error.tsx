'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';

// Tanda A de la auditoría: antes este boundary imprimía error.message + error.stack
// COMPLETO en pantalla, también en producción — detalles internos (paths, nombres de
// funciones) a la vista de cualquiera. Ahora: mensaje genérico + reporte a Sentry.
export default function AdminStoresError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin/stores error]', error);
    Sentry.captureException(error, { tags: { boundary: 'admin/stores' } });
  }, [error]);

  return (
    <div className="container mx-auto py-20 space-y-4 text-center">
      <h2 className="text-lg font-semibold text-destructive">Error en Gestión de Tiendas</h2>
      <p className="text-sm text-muted-foreground">
        Ocurrió un error inesperado. Ya quedó reportado para revisión.
        {error.digest && <span className="block mt-1 text-xs">Código: {error.digest}</span>}
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
