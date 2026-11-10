import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, SearchX } from 'lucide-react';

// 404 en vidrio (rediseño 9/11/2026): tarjeta centrada con el ícono en un cuadradito.
export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100dvh-12rem)] items-center justify-center px-1 py-8">
      <section
        data-testid="not-found"
        className="glass-strong w-full max-w-md rounded-card p-6 text-center sm:p-8 animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none"
      >
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-foreground/[0.07] text-muted-foreground">
          <SearchX className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-headline text-[2rem] font-extrabold leading-tight">Esta página no existe</h1>
        <p className="mt-2 text-base text-muted-foreground">
          El link puede estar roto o la página se movió. Volvé al inicio para seguir.
        </p>
        <Button asChild className="mt-6 h-12 w-full rounded-2xl text-base font-bold">
          <Link href="/">
            <Home className="h-5 w-5" /> Ir al inicio
          </Link>
        </Button>
      </section>
    </div>
  );
}
