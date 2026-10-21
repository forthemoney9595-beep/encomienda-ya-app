'use client';

import Link from 'next/link';
import { Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { money } from '@/lib/format-money';
import { fmtElapsed } from '@/lib/format-date';
import { describeError } from './error-state';

export type KpiFormat = 'money' | 'int' | 'pct' | 'minutes' | 'text';
export type KpiTone = 'default' | 'success' | 'warning' | 'destructive' | 'info';

export interface KpiCardProps {
  label: string;
  /** null = cargando → "…" con aria-busy. NUNCA $0 mientras carga. */
  value: number | string | null | undefined;
  format?: KpiFormat;
  /** Texto chico debajo del número (desglose, comparación, aclaración). */
  hint?: React.ReactNode;
  tone?: KpiTone;
  href?: string;
  error?: unknown;
  onRetry?: () => void;
  /** Si el dato tiene más de 5 min, muestra "calculado hace N". */
  staleAt?: Date | number | null;
  /** Sufijo chico al lado del número ("/ 20", "min"). */
  suffix?: React.ReactNode;
  className?: string;
  /** Para que Playwright/tests lo ubiquen. */
  testId?: string;
}

const TONE_VALUE: Record<KpiTone, string> = {
  default: 'text-foreground',
  success: 'text-success-ink',
  warning: 'text-warning-ink',
  destructive: 'text-destructive-ink',
  info: 'text-info-ink',
};
const TONE_BORDER: Record<KpiTone, string> = {
  default: 'border-border',
  success: 'border-success/50',
  warning: 'border-warning/60',
  destructive: 'border-destructive/50',
  info: 'border-info/50',
};

function formatValue(value: number | string, format: KpiFormat): string {
  if (typeof value === 'string') return value;
  switch (format) {
    case 'money': return money(value);
    case 'pct': return `${Math.round(value * 10) / 10} %`;
    case 'minutes': return `${Math.round(value)}`;
    case 'int': return Math.round(value).toLocaleString('es-AR');
    default: return String(value);
  }
}

/**
 * Tarjeta de KPI única del admin. Estados: loading (value null → "…"), ok, error ("No se pudo
 * calcular · reintentar") y stale (staleAt > 5 min → reloj + "calculado hace N").
 */
export function KpiCard(props: KpiCardProps) {
  const { label, value, format = 'int', hint, tone = 'default', href, error, onRetry, staleAt, suffix, className, testId } = props;
  const loading = value === null || value === undefined;
  const staleMs = staleAt ? Date.now() - (typeof staleAt === 'number' ? staleAt : staleAt.getTime()) : 0;
  const isStale = staleMs > 5 * 60_000;

  const body = (
    <div
      data-testid={testId}
      data-kpi-state={error ? 'error' : loading ? 'loading' : 'ok'}
      aria-busy={loading || undefined}
      className={cn(
        'flex h-full min-w-[168px] flex-col justify-between gap-1 rounded-lg border bg-card p-4 transition-colors',
        TONE_BORDER[error ? 'destructive' : tone],
        href && 'hover:bg-admin-row-hover',
        className,
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      {error ? (
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive-ink" aria-hidden="true" />
          <div className="min-w-0">
            <div className="font-medium text-destructive-ink">No se pudo calcular</div>
            <div className="truncate text-xs text-muted-foreground">{describeError(error).title}</div>
            {onRetry && (
              <button type="button" onClick={(e) => { e.preventDefault(); onRetry(); }} className="mt-1 inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
                <RefreshCw className="h-3 w-3" aria-hidden="true" /> reintentar
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={cn('text-[26px] font-bold leading-tight tracking-tight tabular-nums', loading ? 'text-muted-foreground' : TONE_VALUE[tone])}>
          {loading ? '…' : formatValue(value, format)}
          {!loading && suffix ? <span className="ml-1 text-base font-medium text-muted-foreground">{suffix}</span> : null}
        </div>
      )}
      {(hint || isStale) && !error && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {isStale && <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />}
          {isStale ? <span>calculado hace {fmtElapsed(staleMs)}{hint ? ' · ' : ''}</span> : null}
          {hint}
        </div>
      )}
    </div>
  );

  if (href) return <Link href={href} className="block h-full min-w-0 snap-start">{body}</Link>;
  return <div className="h-full min-w-0 snap-start">{body}</div>;
}

/** Fila de KPIs: scroll horizontal controlado en celular, grilla en escritorio. */
export function KpiRow({ children, cols = 6, className }: { children: React.ReactNode; cols?: 4 | 5 | 6; className?: string }) {
  const grid = cols === 4 ? 'lg:grid-cols-4' : cols === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-6';
  return (
    <div className={cn('flex min-w-0 snap-x gap-3 overflow-x-auto pb-1 no-scrollbar lg:grid lg:overflow-visible lg:pb-0', grid, className)}>
      {children}
    </div>
  );
}
