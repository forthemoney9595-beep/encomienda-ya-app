'use client';

import { cn } from '@/lib/utils';
import { useAdminCrumbs, useAdminLive, type Crumb } from './admin-chrome';

export interface AdminPageProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Migas para la topbar (sin el "Admin" raíz). Si no viene, la topbar las deduce del menú. */
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  kpis?: React.ReactNode;
  filters?: React.ReactNode;
  /** La página tiene un listener en vivo (hace pulsar el chip "En vivo" de la topbar). */
  live?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Ancho máximo del contenido (default 1400 px). */
  wide?: boolean;
}

/**
 * Patrón de página del admin (spec §b.2): título + subtítulo + acciones, KPIs opcionales,
 * FilterBar sticky bajo la topbar en escritorio, y el contenido. Reemplaza a PageHeader y a
 * los headers propios de las fichas.
 */
export function AdminPage({ title, subtitle, crumbs, actions, kpis, filters, live = false, children, className, wide }: AdminPageProps) {
  useAdminCrumbs(crumbs);
  useAdminLive(live);
  return (
    <div className={cn('mx-auto w-full min-w-0 space-y-4', wide ? 'max-w-[1600px]' : 'max-w-[1400px]', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {kpis}
      {filters && <div className="z-10 md:sticky md:top-14">{filters}</div>}
      {children}
    </div>
  );
}
