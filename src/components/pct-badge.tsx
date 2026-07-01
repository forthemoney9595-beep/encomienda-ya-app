import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pct } from '@/lib/analytics-period';

// Extraído de my-store/analytics/page.tsx, reusado en delivery/analytics/page.tsx.
export function PctBadge({ current, prev }: { current: number; prev: number }) {
  // Sin datos en el período anterior no hay con qué comparar -- mostrar "100%" ahí
  // sería engañoso (parecería un crecimiento real cuando en realidad no hay dato base).
  if (prev === 0) {
    if (current === 0) return null;
    return <span className="text-xs font-medium text-muted-foreground">Sin datos previos</span>;
  }
  const p = pct(current, prev);
  return (
    <span className={cn('flex items-center gap-0.5 text-xs font-medium', p.up ? 'text-success' : 'text-destructive')}>
      {p.zero ? <Minus className="h-3 w-3" /> : p.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {p.value.toFixed(0)}%
    </span>
  );
}
