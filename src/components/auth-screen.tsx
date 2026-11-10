'use client';

// Pantallas de ingreso y registro en vidrio (rediseño 9/11/2026, tanda "pantallas comunes").
// Una sola pieza para login, recuperar contraseña y las tres altas: pantalla completa sobre la
// veladura del body (sin fondo opaco que la tape), marca arriba con la estrellita de fiestas y
// una tarjeta de vidrio centrada. Solo es presentación: la lógica de cada formulario (unique_ids,
// batch, rollback, signup-flag, Google) sigue en su página.
import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import Logo from '@/components/logo';
import { Garland, SeasonStar } from '@/components/garland';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Campos de las pantallas de ingreso: 48 px de alto, bien redondeados y con letra de 18 px.
 * Se aplica por selector de descendiente (gana a las clases del <Input>/<SelectTrigger> de
 * shadcn sin tocar esos componentes, que usa toda la app). También lo usa el Perfil.
 */
export const largeFields =
  '[&_input]:h-12 [&_input]:rounded-2xl [&_input]:text-base [&_input]:px-4 ' +
  '[&_button[role=combobox]]:h-12 [&_button[role=combobox]]:rounded-2xl [&_button[role=combobox]]:text-base [&_button[role=combobox]]:px-4 ' +
  '[&_label]:text-[0.95rem] [&_label]:font-semibold ' +
  // Campo con error: borde rojo además del mensaje de abajo (no depender solo del color del texto).
  '[&_input[aria-invalid=true]]:border-destructive [&_input[aria-invalid=true]]:ring-1 [&_input[aria-invalid=true]]:ring-destructive';

/** Botón principal y secundario de las pantallas de ingreso (48 px, radio 16 px). */
export const authButton = 'h-12 w-full rounded-2xl text-base font-bold';

export function AuthBrand() {
  return (
    <Link
      href="/"
      className="mb-5 inline-flex min-h-12 items-center gap-2.5 rounded-2xl px-2 font-headline text-2xl font-extrabold tracking-tight text-foreground"
    >
      <span className="cat-tile tile-brand flex h-11 w-11 items-center justify-center rounded-[0.9rem]">
        <Logo className="h-7 w-7 text-white" />
      </span>
      EncomiendaYA
      <SeasonStar />
    </Link>
  );
}

export function AuthScreen({
  title,
  description,
  eyebrow,
  children,
  footer,
  size = 'md',
  testId,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Línea chica arriba del título (p. ej. "Paso 1 de 2"). */
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  /** Va debajo de la tarjeta, fuera del vidrio (links de "¿ya tenés cuenta?"). */
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
  testId?: string;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-transparent px-4 py-8 sm:py-12">
      <AuthBrand />
      <section
        data-testid={testId}
        className={cn(
          'glass-strong relative w-full rounded-card p-5 sm:p-8',
          'animate-in fade-in-0 slide-in-from-bottom-3 duration-500 motion-reduce:animate-none',
          size === 'lg' ? 'max-w-lg' : 'max-w-md',
        )}
      >
        <Garland />
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="font-headline text-[2rem] font-extrabold leading-[1.05] tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-2 text-base leading-snug text-muted-foreground">{description}</p>}
        <div className={cn('mt-6', largeFields)}>{children}</div>
      </section>
      {footer && <div className="mt-5 w-full max-w-md space-y-2 text-center text-base text-muted-foreground">{footer}</div>}
    </div>
  );
}

/** "Paso N de M" con una barrita por paso (el alta de repartidor). */
export function AuthSteps({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-primary">
        Paso {current} de {total} · {label}
      </p>
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-500',
              i < current ? 'bg-primary' : 'bg-foreground/15',
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** Separador "o continuá con" — sin fondo propio (sobre vidrio un bg-card se ve como un parche). */
export function AuthDivider({ children = 'o continuá con' }: { children?: React.ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-sm text-muted-foreground">
      <span className="h-px flex-1 bg-foreground/15" />
      <span>{children}</span>
      <span className="h-px flex-1 bg-foreground/15" />
    </div>
  );
}

/** Título chico de un grupo de campos dentro de un formulario largo (alta de tienda). */
export function AuthGroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="pt-1 font-headline text-xl font-extrabold leading-tight text-primary">{children}</p>
  );
}

export function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" className={cn(authButton, 'relative bg-background/60')} onClick={onClick} disabled={disabled}>
      <svg className="absolute left-4 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      Google
    </Button>
  );
}

/** Fila grande tocable (elegir tipo de cuenta, puertas de negocio). */
export function AuthChoice({
  href,
  icon,
  title,
  description,
  testId,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex min-h-[4.5rem] items-center gap-4 rounded-2xl border border-foreground/10 bg-background/50 p-3 pr-4 text-left transition-[background-color,transform] duration-200 hover:bg-primary/10 active:scale-[0.99] motion-reduce:transition-none"
    >
      <span className="cat-tile tile-brand flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.9rem] [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-headline text-xl font-bold leading-tight text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
