'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import './globals.css';

// Reemplaza al layout raíz cuando ese mismo layout falla: por eso trae su propio <html>, sus
// estilos y la elección de tema del dispositivo (antes forzaba oscuro, de cuando era el único
// tema). Sin el shell ni contextos: solo un botón de recargar.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('eya-theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}`,
          }}
        />
      </head>
      <body>
        <main className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
          <section role="alert" className="glass-strong w-full max-w-md rounded-card p-6 text-center sm:p-8">
            <h1 className="font-headline text-[2rem] font-extrabold leading-tight">Algo salió mal</h1>
            <p className="mt-2 text-base text-muted-foreground">
              Pasó un error inesperado. Recargá la página para seguir.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary px-4 text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Recargar
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
