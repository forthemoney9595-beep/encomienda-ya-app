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
    console.error('Error no controlado:', error);
    Sentry.captureException(error);
  }, [error]);

  // Error de una pantalla, en vidrio (rediseño 9/11/2026). El shell sigue alrededor: se puede
  // reintentar o volver sin recargar toda la app.
  return (
    <div className="flex min-h-[calc(100dvh-12rem)] items-center justify-center px-1 py-8">
      <section
        role="alert"
        data-testid="error-screen"
        className="glass-strong w-full max-w-md rounded-card p-6 text-center sm:p-8 animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none"
      >
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-destructive text-destructive-foreground">
          <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-headline text-[2rem] font-extrabold leading-tight">Algo salió mal</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Pasó un error inesperado. Podés intentar de nuevo o volver al inicio.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button onClick={() => reset()} variant="outline" className="h-12 rounded-2xl bg-background/60 text-base font-bold">
            <RotateCcw className="h-5 w-5" /> Reintentar
          </Button>
          <Button asChild className="h-12 rounded-2xl text-base font-bold">
            <Link href="/">
              <Home className="h-5 w-5" /> Ir al inicio
            </Link>
          </Button>
        </div>
        {error.digest && (
          <p className="mt-4 text-xs text-muted-foreground">Código del error: {error.digest}</p>
        )}
      </section>
    </div>
  );
}
