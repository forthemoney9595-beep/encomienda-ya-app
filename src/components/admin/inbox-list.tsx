'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { money } from '@/lib/format-money';
import { fmtElapsed } from '@/lib/format-date';
import { describeError } from './error-state';

export type InboxSeverity = 'destructive' | 'warning' | 'info';
export type InboxGroup = 'money' | 'disputes' | 'approvals' | 'info';
export type InboxKind = 'mismatch' | 'withdrawal' | 'claim' | 'incident' | 'approval' | 'stuck';

export interface InboxAction {
  label: string;
  onClick?: () => void | Promise<void>;
  href?: string;
  primary?: boolean;
  tone?: 'default' | 'destructive' | 'success';
  busy?: boolean;
}

export interface InboxItem {
  id: string;
  kind: InboxKind;
  severity: InboxSeverity;
  group: InboxGroup;
  title: string;
  subtitle?: string;
  amount?: number | null;
  /** Milisegundos epoch del evento (para "hace N"). */
  since: number | null;
  href: string;
  icon: LucideIcon;
  actions?: InboxAction[];
  /** Datos crudos que las acciones de la página necesitan (uid, rol, docId, etc.). */
  meta?: Record<string, unknown>;
}

export interface InboxSourceError { source: string; error: unknown }

export interface InboxListProps {
  items: InboxItem[];
  loading?: boolean;
  errors?: InboxSourceError[];
  groupBy?: 'severity' | 'kind' | 'none';
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  /** Si viene, solo se listan N y se muestra el pie "Ver las M en Bandeja". */
  limit?: number;
  moreHref?: string;
  className?: string;
  now?: number;
}

export const GROUP_LABELS: Record<InboxGroup, string> = {
  money: 'Plata',
  disputes: 'Disputas',
  approvals: 'Aprobaciones',
  info: 'Informativo',
};
const GROUP_ORDER: InboxGroup[] = ['money', 'disputes', 'approvals', 'info'];
const SEVERITY_RANK: Record<InboxSeverity, number> = { destructive: 0, warning: 1, info: 2 };

const SEV_BAR: Record<InboxSeverity, string> = {
  destructive: 'border-l-destructive',
  warning: 'border-l-warning',
  info: 'border-l-info',
};
const SEV_ICON: Record<InboxSeverity, string> = {
  destructive: 'text-destructive-ink',
  warning: 'text-warning-ink',
  info: 'text-info-ink',
};

/** Orden canónico de la Bandeja: gravedad → grupo → más viejo primero. */
export function sortInboxItems(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    const g = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    if (g !== 0) return g;
    return (a.since ?? Number.MAX_SAFE_INTEGER) - (b.since ?? Number.MAX_SAFE_INTEGER);
  });
}

function Row({ item, now }: { item: InboxItem; now: number }) {
  const Icon = item.icon;
  return (
    <li
      data-testid="inbox-item"
      data-severity={item.severity}
      data-kind={item.kind}
      className={cn('flex min-h-[56px] items-center gap-3 border-l-[3px] px-3 py-2 transition-colors hover:bg-admin-row-hover sm:px-4', SEV_BAR[item.severity])}
    >
      <Icon className={cn('h-4 w-4 shrink-0', SEV_ICON[item.severity])} aria-hidden="true" />
      <Link href={item.href} className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
          {typeof item.amount === 'number' && item.amount > 0 && (
            <span className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount)}</span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {item.subtitle}{item.subtitle && item.since ? ' · ' : ''}{item.since ? `hace ${fmtElapsed(now - item.since)}` : ''}
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        {(item.actions ?? []).map((a, i) => {
          const cls = cn(
            'h-9 gap-1',
            a.tone === 'destructive' && 'text-destructive-ink hover:text-destructive-ink',
            a.tone === 'success' && 'text-success-ink hover:text-success-ink',
          );
          return a.href ? (
            <Button key={i} asChild variant={a.primary ? 'default' : 'outline'} size="sm" className={cls}>
              <Link href={a.href}>{a.label}</Link>
            </Button>
          ) : (
            <Button key={i} type="button" variant={a.primary ? 'default' : 'outline'} size="sm" className={cls} disabled={a.busy} onClick={() => { void a.onClick?.(); }}>
              {a.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{a.label}
            </Button>
          );
        })}
        <Link href={item.href} aria-label="Abrir" className="hidden h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-admin-row-hover sm:inline-flex">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

/**
 * Lista de la Bandeja: ordenada por gravedad (plata primero), agrupada, con barra de severidad
 * por fila, error POR FUENTE (si falla `claims` lo dice en una línea sin esconder el resto) y
 * vacío "Nada pendiente — todo al día".
 */
export function InboxList(props: InboxListProps) {
  const { items, loading, errors = [], groupBy = 'severity', emptyTitle = 'Nada pendiente. Todo al día.', emptyDescription, limit, moreHref, className } = props;
  const now = props.now ?? Date.now();
  const sorted = sortInboxItems(items);
  const shown = typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  const rest = sorted.length - shown.length;

  const groups: { key: string; label: string | null; items: InboxItem[] }[] = (() => {
    if (groupBy === 'none' || typeof limit === 'number') return [{ key: 'all', label: null, items: shown }];
    const map = new Map<string, InboxItem[]>();
    shown.forEach(it => {
      const k = groupBy === 'severity' ? it.group : it.kind;
      map.set(k, [...(map.get(k) ?? []), it]);
    });
    const order = groupBy === 'severity' ? GROUP_ORDER : Array.from(map.keys());
    return order.filter(k => map.has(k)).map(k => ({ key: k, label: groupBy === 'severity' ? GROUP_LABELS[k as InboxGroup] : k, items: map.get(k)! }));
  })();

  return (
    <div className={cn('min-w-0 overflow-hidden rounded-lg border border-border bg-card', className)} data-testid="inbox-list">
      {errors.length > 0 && (
        <ul className="divide-y divide-border border-b border-border">
          {errors.map((e, i) => {
            const d = describeError(e.error);
            return (
              <li key={i} role="alert" className="flex items-center gap-2 bg-destructive/10 px-4 py-2 text-xs text-destructive-ink">
                <span className="font-medium">{e.source}:</span> {d.title}{d.detail ? ` — ${d.detail}` : ''}
              </li>
            );
          })}
        </ul>
      )}
      {loading && items.length === 0 ? (
        <div className="space-y-2 p-4" aria-busy="true"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center" data-testid="inbox-empty">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success-ink"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></span>
          <p className="font-medium">{emptyTitle}</p>
          <p className="text-xs text-muted-foreground">{emptyDescription ?? `Revisado a las ${new Date(now).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}</p>
        </div>
      ) : (
        groups.map(g => (
          <div key={g.key}>
            {g.label && (
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.label} <span className="font-normal tabular-nums">· {g.items.length}</span>
              </div>
            )}
            <ul className="divide-y divide-border">{g.items.map(it => <Row key={it.id} item={it} now={now} />)}</ul>
          </div>
        ))
      )}
      {rest > 0 && moreHref && (
        <Link href={moreHref} className="flex min-h-[44px] items-center justify-between gap-2 border-t border-border px-4 text-sm text-muted-foreground hover:bg-admin-row-hover">
          <span>Y {rest} más</span><span className="font-medium text-primary-ink">Ver las {sorted.length} en Bandeja →</span>
        </Link>
      )}
    </div>
  );
}
