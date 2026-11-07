'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { money } from '@/lib/format-money';
import type { DailyStatsDay } from './use-daily-stats';

const fmtDay = (id: string) => `${id.slice(8, 10)}/${id.slice(5, 7)}`;

/**
 * Neto de la app por día del período (tarifas + comisiones, netas de reembolsos). Los días sin
 * actividad se dibujan en cero; el día en curso se marca como "hoy (en vivo)".
 */
export function DailyNetChart({ days, loading }: { days: DailyStatsDay[]; loading: boolean }) {
  const data = useMemo(() => days.map(d => ({
    id: d.id, label: fmtDay(d.id), neto: Math.round(d.bucket?.platform ?? 0), entregados: d.bucket?.delivered ?? 0, live: !!d.live,
  })), [days]);
  const hasAny = data.some(d => d.neto > 0 || d.entregados > 0);
  const many = data.length > 45;

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-4" data-testid="daily-chart" aria-busy={loading || undefined}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Neto de la app por día</h2>
        <span className="text-xs text-muted-foreground">tarifas + comisiones, netas de reembolsos · por fecha de creación del pedido</span>
      </div>
      {!loading && !hasAny ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Sin pedidos entregados en este período.</p>
      ) : (
        <ChartContainer config={{ neto: { label: 'Neto de la app', color: 'hsl(var(--chart-1))' } }} className="h-[220px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={many ? 'preserveStartEnd' : data.length > 14 ? 3 : 0} className="text-xs text-muted-foreground" />
            <YAxis tickLine={false} axisLine={false} width={56} allowDecimals={false} className="text-xs text-muted-foreground"
              tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}k` : `$${Math.round(v)}`)} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(_l, p) => { const d = p?.[0]?.payload as { id: string; live: boolean; entregados: number } | undefined; return d ? `${d.id}${d.live ? ' · hoy (en vivo)' : ''} · ${d.entregados} entregado${d.entregados === 1 ? '' : 's'}` : ''; }} formatter={(v) => money(Number(v))} />} />
            <Bar dataKey="neto" fill="var(--color-neto)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      )}
    </section>
  );
}
