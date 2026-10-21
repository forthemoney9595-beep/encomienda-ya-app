'use client';

import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/format-date';

export type TimelineTone = 'default' | 'success' | 'info' | 'warning' | 'destructive' | 'pending';

export interface TimelineEvent {
  key: string;
  /** Timestamp/Date; null = hito que todavía no pasó (se dibuja apagado). */
  at: unknown;
  label: string;
  detail?: React.ReactNode;
  actor?: string;
  tone?: TimelineTone;
}

const DOT: Record<TimelineTone, string> = {
  default: 'bg-foreground/70',
  success: 'bg-success',
  info: 'bg-info',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  pending: 'bg-transparent border-2 border-border',
};

/** Historial vertical de hitos (ficha de pedido). Los hitos sin fecha quedan apagados. */
export function Timeline({ events, className }: { events: TimelineEvent[]; className?: string }) {
  return (
    <ol className={cn('relative space-y-0 border-l border-border pl-5', className)}>
      {events.map((ev) => {
        const pending = !ev.at;
        const tone: TimelineTone = pending ? 'pending' : (ev.tone ?? 'default');
        return (
          <li key={ev.key} className="relative pb-4 last:pb-0">
            <span className={cn('absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-card', DOT[tone])} aria-hidden="true" />
            <div className={cn('flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5', pending && 'opacity-50')}>
              <span className="text-sm font-medium">{ev.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{pending ? 'pendiente' : fmtDate(ev.at, 'long')}</span>
            </div>
            {(ev.detail || ev.actor) && !pending && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {ev.detail}{ev.detail && ev.actor ? ' · ' : ''}{ev.actor}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
