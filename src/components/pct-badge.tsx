import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pct } from '@/lib/analytics-period';

// Extraído de my-store/analytics/page.tsx, reusado en delivery/analytics/page.tsx.
export function PctBadge({ current, prev }: { current: number; prev: number }) {
  // Sin datos en el período anterior no hay con qué comparar -- mostrar "100%" ahí
  // sería engañoso (parecería un crecimiento real cuando en realidad no hay dato base).
  if (prev === 0) {
    if (current === 0) return null;
    return <span className="inline-flex items-center rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs font-semibold text-muted-foreground">Sin datos previos</span>;
  }
  const p = pct(current, prev);
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', p.zero ? 'bg-foreground/[0.06] text-muted-foreground' : p.up ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive')}>
      {p.zero ? <Minus className="h-3.5 w-3.5" aria-hidden="true" /> : p.up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
      {p.value.toFixed(0)}%
    </span>
  );
}
