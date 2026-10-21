'use client';

import { cn } from '@/lib/utils';
import { getOrderStatusKind, type OrderStatusKind } from '@/lib/order-status';
import { reasonLabel } from '@/lib/payment-issues';

export type StatusKind = 'order' | 'payment' | 'account' | 'withdrawal' | 'claim' | 'incident' | 'mismatch';

type Tone = OrderStatusKind; // success | info | warning | destructive | neutral

/** Badge SUAVE: relleno al 15 % + texto de TINTA (AA en los dos temas, ver globals.css). */
export const SOFT_BADGE: Record<Tone, string> = {
  success: 'bg-success/15 text-success-ink',
  info: 'bg-info/15 text-info-ink',
  warning: 'bg-warning/15 text-warning-ink',
  destructive: 'bg-destructive/15 text-destructive-ink',
  neutral: 'bg-muted text-muted-foreground',
};

export function resolveStatus(kind: StatusKind, value: string | undefined | null, extra?: { resolved?: boolean; resolution?: string }): { label: string; tone: Tone } {
  const v = (value ?? '').toString();
  switch (kind) {
    case 'order':
      return { label: v || '—', tone: getOrderStatusKind(v) };
    case 'payment': {
      if (v === 'paid') return { label: 'Pagado', tone: 'success' };
      if (v === 'reversed') return { label: 'Revertido', tone: 'destructive' };
      if (v === 'refunded') return { label: 'Reembolsado', tone: 'warning' };
      return { label: 'Sin pagar', tone: 'neutral' };
    }
    case 'account': {
      const s = v.toLowerCase();
      if (s === 'activo' || s === 'aprobada') return { label: v, tone: 'success' };
      if (s === 'pendiente') return { label: 'Pendiente', tone: 'warning' };
      if (s === 'rechazado' || s === 'rechazada') return { label: v, tone: 'destructive' };
      if (s === 'inactivo') return { label: 'Inactivo', tone: 'neutral' };
      return { label: v || '—', tone: 'neutral' };
    }
    case 'withdrawal': {
      if (v === 'approved') return { label: 'Pagado', tone: 'success' };
      if (v === 'rejected') return { label: 'Rechazado', tone: 'destructive' };
      if (v === 'pending') return { label: 'Pendiente', tone: 'warning' };
      return { label: v || '—', tone: 'neutral' };
    }
    case 'claim': {
      if (!extra?.resolved) return { label: 'En revisión', tone: 'warning' };
      if (extra.resolution === 'refunded') return { label: 'Reembolsado', tone: 'success' };
      if (extra.resolution === 'rejected') return { label: 'Rechazado', tone: 'neutral' };
      return { label: 'Resuelto', tone: 'success' };
    }
    case 'incident': {
      if (extra?.resolved) return { label: 'Resuelto', tone: 'success' };
      if (v === 'problem_reported') return { label: 'Problema reportado', tone: 'destructive' };
      if (v === 'released') return { label: 'Pedido soltado', tone: 'info' };
      return { label: v || 'Incidente', tone: 'warning' };
    }
    case 'mismatch': {
      if (extra?.resolved) return { label: 'Resuelto', tone: 'success' };
      return { label: reasonLabel(v), tone: 'destructive' };
    }
  }
}

export interface StatusBadgeProps {
  kind: StatusKind;
  value: string | undefined | null;
  resolved?: boolean;
  resolution?: string;
  className?: string;
  /** Texto extra a la derecha ("· 2 h 10 m"). */
  suffix?: React.ReactNode;
}

/** ÚNICO mapeo estado → color del admin (pedidos vía getOrderStatusKind). */
export function StatusBadge({ kind, value, resolved, resolution, className, suffix }: StatusBadgeProps) {
  const { label, tone } = resolveStatus(kind, value, { resolved, resolution });
  return (
    <span className={cn('inline-flex h-[22px] max-w-full items-center whitespace-nowrap rounded-full px-2 text-xs font-semibold', SOFT_BADGE[tone], className)}>
      <span className="truncate">{label}</span>
      {suffix ? <span className="ml-1 font-normal opacity-80">{suffix}</span> : null}
    </span>
  );
}

/** Pastilla de conteo del menú (nunca más de 2 dígitos). */
export function CountPill({ count, tone = 'destructive', className }: { count: number; tone?: 'destructive' | 'warning' | 'primary'; className?: string }) {
  if (!count || count <= 0) return null;
  const cls = tone === 'warning' ? 'bg-warning text-warning-foreground' : tone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground';
  return (
    <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums', cls, className)} aria-label={`${count} pendientes`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
