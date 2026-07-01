'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function AdminStoresError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin/stores error]', error);
  }, [error]);

  return (
    <div className="container mx-auto py-20 space-y-4">
      <h2 className="text-lg font-semibold text-destructive">Error en Gestión de Tiendas</h2>
      <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-60 text-destructive">
        {error.message}
        {'\n'}
        {error.stack}
      </pre>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
