'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es" className="dark">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center px-4">
          <h1 className="text-2xl font-bold">Algo salió mal</h1>
          <p className="text-muted-foreground max-w-sm">
            Ocurrió un error inesperado. Recargá la página para continuar.
          </p>
        </div>
      </body>
    </html>
  );
}
