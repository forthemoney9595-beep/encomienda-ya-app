'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import { Home, RotateCcw, AlertTriangle } from 'lucide-react';

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('💥 Error no controlado:', error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center gap-4 text-center px-4">
      <AlertTriangle className="h-16 w-16 text-destructive" />
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="text-muted-foreground max-w-sm">
        Ocurrió un error inesperado. Podés intentar de nuevo o volver al inicio.
      </p>
      <div className="flex gap-3 mt-2">
        <Button onClick={() => reset()} variant="outline">
          <RotateCcw className="mr-2 h-4 w-4" /> Reintentar
        </Button>
        <Button asChild>
          <Link href="/">
            <Home className="mr-2 h-4 w-4" /> Ir al inicio
          </Link>
        </Button>
      </div>
    </div>
  );
}
