'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bike, Search, Shield, Store, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Modelo A "Lista" del rediseño en vidrio (9/11/2026, panel admin): buscador de vidrio,
 * chips con una píldora que se DESLIZA al elegir, y filas dentro de una tarjeta de vidrio
 * con el cuadradito del rubro (o de la persona) a la izquierda. Lo usan Tiendas,
 * Repartidores y Cuentas. Solo presentación: el filtrado y los datos los pone cada página.
 */

/* ───────────────────────── Buscador ───────────────────────── */

export function GlassSearch({
  value, onChange, placeholder, label, hint, testId, className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Nombre accesible (default = placeholder). */
  label?: string;
  /** Alcance de la búsqueda, debajo del campo (regla del admin: siempre aclararlo). */
  hint?: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <label className="glass flex min-h-[48px] items-center gap-2 rounded-card px-3.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label ?? placeholder}
          data-testid={testId}
          className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Borrar búsqueda"
            className="-mr-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-admin-row-hover hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </label>
      {hint && <p className="px-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ───────────────────────── Chips con píldora deslizante ───────────────────────── */

export interface SlideChip<V extends string = string> {
  value: V;
  label: string;
  count?: number | null;
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * Chips de filtro con una píldora de la marca que se desliza hasta el elegido (transform +
 * width, 350 ms; con "reducir movimiento" el globals.css corta la transición). Cada chip es
 * un botón con `aria-pressed`. Scroll horizontal en celular sin barra.
 */
export function SlidingChips<V extends string>({
  chips, value, onChange, label = 'Filtrar', testId, className,
}: {
  chips: SlideChip<V>[];
  value: V;
  onChange: (v: V) => void;
  label?: string;
  testId?: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  const place = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const btn = track.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (!btn || !btn.offsetWidth) { setPill(null); return; }
    setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
  }, []);

  // Se recalcula al cambiar el elegido o los textos (los conteos cambian el ancho).
  const sig = chips.map(c => `${c.value}:${c.label}:${c.count ?? ''}`).join('|');
  useLayoutEffect(() => { place(); }, [place, value, sig]);
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place());
    ro.observe(track);
    return () => ro.disconnect();
  }, [place]);

  return (
    <div className={cn('-mx-1 min-w-0 overflow-x-auto px-1 py-0.5 no-scrollbar', className)}>
      <div ref={trackRef} className="relative inline-flex gap-1.5" role="group" aria-label={label} data-testid={testId}>
        <span
          aria-hidden="true"
          className={cn('pointer-events-none absolute left-0 top-0 h-full rounded-full bg-primary shadow-sm transition-[transform,width] duration-300 ease-spring', !pill && 'opacity-0')}
          style={pill ? { width: pill.w, transform: `translateX(${pill.x}px)` } : undefined}
        />
        {chips.map(c => {
          const active = c.value === value;
          const Icon = c.icon;
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={active}
              data-chip={c.value}
              onClick={() => onChange(c.value)}
              className={cn(
                'relative z-[1] inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors duration-200',
                active ? 'border-transparent text-primary-foreground' : 'glass text-muted-foreground hover:text-foreground',
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
              {c.label}
              {c.count !== undefined && (
                <span className={cn('tabular-nums', active ? 'opacity-90' : 'opacity-80')} aria-busy={c.count === null || undefined}>
                  {c.count === null ? '…' : c.count.toLocaleString('es-AR')}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Tarjeta + filas ───────────────────────── */

export function ListCard({ children, className, testId }: { children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <div className={cn('glass min-w-0 overflow-hidden rounded-card py-1', className)} data-testid={testId}>
      {children}
    </div>
  );
}

/** Encabezado de grupo dentro de una ListCard (ej. "Clientes · 12"), opcionalmente colapsable. */
export function ListGroupHeader({ children, onClick, expanded, className }: { children: React.ReactNode; onClick?: () => void; expanded?: boolean; className?: string }) {
  const cls = cn('flex w-full items-center gap-2 px-4 pb-1.5 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground', onClick && 'min-h-[40px] hover:text-foreground', className);
  if (!onClick) return <div className={cls}>{children}</div>;
  return <button type="button" onClick={onClick} aria-expanded={expanded} className={cls}>{children}</button>;
}

export interface ListRowProps {
  leading?: React.ReactNode;
  title: React.ReactNode;
  /** Link del título (la fila entera NO es un link: adentro hay botones). */
  href?: string;
  subtitle?: React.ReactNode;
  /** Columna derecha: estado arriba, dato chico abajo (rating, conteo). */
  meta?: React.ReactNode;
  /** Botones de acción (íconos ≥ 36 px), a la derecha de todo. */
  actions?: React.ReactNode;
  /** Posición en la lista para la aparición escalonada (se corta a los 12 primeros). */
  index?: number;
  highlight?: 'warning' | 'destructive';
  testId?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Fila de la lista: separador fino que arranca después del cuadradito (como el prototipo),
 * hover suave y aparición escalonada (`stagger-in`, apagada con "reducir movimiento").
 */
export function ListRow({ leading, title, href, subtitle, meta, actions, index = 0, highlight, testId, className, children }: ListRowProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'stagger-in relative flex min-h-[64px] items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-admin-row-hover',
        'before:absolute before:left-[3.9rem] before:right-0 before:top-0 before:h-px before:bg-foreground/10 first:before:hidden',
        highlight === 'warning' && 'bg-warning/[0.07]',
        highlight === 'destructive' && 'bg-destructive/[0.07]',
        className,
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-semibold leading-snug">
          {href ? <Link href={href} className="hover:underline focus-visible:underline">{title}</Link> : title}
        </div>
        {subtitle && <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>}
        {children}
      </div>
      {meta && <div className="hidden shrink-0 flex-col items-end gap-1 text-sm text-muted-foreground min-[380px]:flex">{meta}</div>}
      {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
    </div>
  );
}

/* ───────────────────────── Cuadradito de persona ───────────────────────── */

// Sin colores de RUBRO a propósito (naranja/dorado/verde agua/azul significan rubro en toda
// la app): las personas van en petróleo de marca o neutro y se distinguen por el ícono.
const PERSON = {
  delivery: { icon: Bike, tile: 'cat-tile tile-brand' },
  store: { icon: Store, tile: 'cat-tile tile-brand' },
  admin: { icon: Shield, tile: 'bg-foreground text-background' },
  buyer: { icon: UserRound, tile: 'bg-muted text-foreground' },
} as const;

/**
 * Cuadradito para PERSONAS (repartidores, cuentas): mismo lenguaje que CategoryTile, con el
 * ícono del rol en vez del rubro. Si la persona tiene foto, va la foto en el mismo recuadro.
 */
export function PersonTile({ role, photo, className, label }: { role?: string; photo?: string | null; className?: string; label?: string }) {
  const p = PERSON[(role as keyof typeof PERSON) in PERSON ? (role as keyof typeof PERSON) : 'buyer'];
  const Icon = p.icon;
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo} alt={label ?? ''} className={cn('h-[2.25rem] w-[2.25rem] shrink-0 rounded-[0.75rem] object-cover', className)} {...(label ? {} : { 'aria-hidden': true })} />
    );
  }
  return (
    <span className={cn('grid h-[2.25rem] w-[2.25rem] shrink-0 place-items-center rounded-[0.75rem]', p.tile, className)} {...a11y}>
      <Icon className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />
    </span>
  );
}

/** Botón-ícono de fila (≥ 36 px, con aria-label obligatorio). */
export function RowIconButton({ label, onClick, href, children, tone, testId, className }: { label: string; onClick?: () => void; href?: string; children: React.ReactNode; tone?: 'destructive'; testId?: string; className?: string }) {
  const cls = cn('inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-admin-row-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', tone === 'destructive' && 'hover:text-destructive-ink', className);
  if (href) return <Link href={href} aria-label={label} title={label} className={cls} data-testid={testId}>{children}</Link>;
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={cls} data-testid={testId}>{children}</button>;
}
