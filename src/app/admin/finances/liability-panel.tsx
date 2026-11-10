'use client';

import { useMemo, useState } from 'react';
import { Loader2, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { authedGet } from '@/lib/authed-fetch';
import { money } from '@/lib/format-money';
import { fmtDate } from '@/lib/format-date';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { KpiCard, KpiRow } from '@/components/admin/kpi-card';
import { EntityLink } from '@/components/admin/entity-link';
import { EmptyState } from '@/components/admin/empty-state';

type Circuit = 'all' | 'store' | 'delivery';

interface LiabilityRow { id: string; name: string; role: 'store' | 'delivery'; earned: number; paid: number; available: number; pending: number; debt: number; owed: number }
interface OverpaidRow { id: string; name: string; role: 'store' | 'delivery'; earned: number; paid: number; debt: number }
interface LiabilityResponse {
  storeLiability: number; driverLiability: number; totalPending: number; totalDebt: number;
  counts: { stores: number; drivers: number };
  top: LiabilityRow[]; overpaid: OverpaidRow[]; computedAt: number;
}

const CIRCUITS: { value: Circuit; label: string; hint: string }[] = [
  { value: 'all', label: 'Todos', hint: 'tiendas + repartidores' },
  { value: 'store', label: 'Tiendas', hint: 'venta de productos' },
  { value: 'delivery', label: 'Repartidores', hint: 'envíos realizados' },
];

/**
 * Pasivo real: cuánto se le debe HOY a cada cuenta, incluida la plata que nadie solicitó
 * todavía. Lo calcula `/api/admin/liability` con las MISMAS funciones que aprueban los
 * retiros (no puede desincronizarse del pago). Es O(tiendas + repartidores) → se dispara con
 * un botón, no al abrir la página. T2: filtrable por circuito (antes ignoraba la pestaña) y
 * muestra `totalPending` / `totalDebt` / `computedAt`, que la API ya mandaba y nadie leía.
 */
export function LiabilityPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<LiabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [circuit, setCircuit] = useState<Circuit>('all');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await authedGet('/api/admin/liability', user);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      setData(json as LiabilityResponse);
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'No se pudo calcular el pasivo', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => (data?.top ?? []).filter(r => circuit === 'all' || r.role === circuit), [data, circuit]);
  const overpaid = useMemo(() => (data?.overpaid ?? []).filter(r => circuit === 'all' || r.role === circuit), [data, circuit]);
  // El total del circuito sale del MISMO número que la tarjeta (la API suma antes de redondear;
  // sumar las filas redondeadas podría diferir por $1 y parecer un error).
  const circuitTotal = data ? (circuit === 'store' ? data.storeLiability : circuit === 'delivery' ? data.driverLiability : data.storeLiability + data.driverLiability) : null;
  const circuitPending = data ? rows.reduce((s, r) => s + r.pending, 0) : null;
  const circuitDebt = data ? overpaid.reduce((s, r) => s + r.debt, 0) : null;

  return (
    <section className="min-w-0 overflow-hidden glass rounded-card" data-testid="liability-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4 text-primary-ink" aria-hidden="true" /> Pasivo real</h2>
          <p className="text-xs text-muted-foreground">Cuánto se le debe hoy a cada cuenta, incluida la plata que todavía nadie solicitó. Mismas fórmulas que aprueban los retiros.</p>
        </div>
        <Button type="button" variant={data ? 'outline' : 'default'} size="sm" className="h-9 gap-1.5" onClick={load} disabled={loading} data-testid="liability-load">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          {data ? 'Recalcular' : 'Calcular lo que se debe'}
        </Button>
      </div>

      <div className="space-y-4 p-4">
        {/* Circuito: filtra la lista Y el total (antes el panel ignoraba la pestaña de circuito). */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Circuito del pasivo">
          {CIRCUITS.map(c => (
            <button key={c.value} type="button" onClick={() => setCircuit(c.value)} aria-pressed={circuit === c.value} data-circuit={c.value}
              className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors', circuit === c.value ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-admin-row-hover')}>
              {c.label}<span className={cn('text-xs', circuit === c.value ? 'opacity-90' : 'text-muted-foreground')}>· {c.hint}</span>
            </button>
          ))}
        </div>

        <KpiRow cols={4}>
          <KpiCard testId="kpi-liability-total" label={`Se debe (${CIRCUITS.find(c => c.value === circuit)?.label.toLowerCase()})`} value={data ? circuitTotal : '—'} format={data ? 'money' : 'text'} tone="warning"
            hint={data ? (circuit === 'all' ? `tiendas ${money(data.storeLiability)} · repartidores ${money(data.driverLiability)}` : `${rows.length} cuenta${rows.length === 1 ? '' : 's'} con saldo`) : 'tocá "Calcular" (recorre todas las cuentas)'} staleAt={data?.computedAt ?? null} />
          <KpiCard testId="kpi-liability-pending" label="Ya solicitado (retiros pendientes)" value={data ? (circuit === 'all' ? data.totalPending : circuitPending) : '—'} format={data ? 'money' : 'text'} hint="parte de la deuda que ya tiene un retiro esperando tu aprobación" />
          <KpiCard testId="kpi-liability-debt" label="Pagado de más" value={data ? (circuit === 'all' ? data.totalDebt : circuitDebt) : '—'} format={data ? 'money' : 'text'} tone={data && (circuit === 'all' ? data.totalDebt : circuitDebt ?? 0) > 0 ? 'destructive' : 'default'} hint="cuentas con saldo negativo (reembolso posterior a la liquidación)" />
          <KpiCard testId="kpi-liability-at" label="Calculado" value={data ? fmtDate(data.computedAt, 'long') : '—'} format="text" hint={data ? `${data.counts.stores} tienda${data.counts.stores === 1 ? '' : 's'} · ${data.counts.drivers} repartidor${data.counts.drivers === 1 ? '' : 'es'} con algo pendiente` : 'sin calcular todavía'} />
        </KpiRow>

        {data && (
          <>
            <p className="rounded-md border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              <strong className="text-foreground">Cómo se calcula:</strong> lo que cada cuenta <strong>ganó</strong> por sus pedidos entregados (neto: sin envío ni tarifa, menos comisión y reembolsos) <strong>− lo que ya se le pagó</strong> por retiros. Lo &quot;solicitado&quot; es la parte de esa deuda que ya tiene un retiro pendiente.
            </p>

            {overpaid.length > 0 && (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" data-testid="liability-overpaid">
                <strong className="text-destructive-ink">Se le pagó de más a {overpaid.length}:</strong>
                {overpaid.map(o => (
                  <div key={`${o.role}-${o.id}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <EntityLink type={o.role === 'store' ? 'store' : 'driver'} id={o.id} label={o.name} />
                    <span className="text-muted-foreground">cobró {money(o.paid)} · sus ventas justifican {money(o.earned)} → <strong className="text-destructive-ink">debe {money(o.debt)}</strong></span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Suele pasar al reembolsar un pedido ya liquidado (o por retiros de datos de prueba sin ventas). No se le vuelve a pagar hasta que sus ventas futuras absorban la deuda.</p>
              </div>
            )}

            {rows.length === 0 ? (
              <EmptyState compact title="No se le debe nada a nadie en este circuito" description="Todo lo ganado ya fue pagado." />
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-[13px]" data-testid="liability-table">
                  <thead>
                    <tr>
                      <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cuenta</th>
                      <th className="border-b border-border px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ganó</th>
                      <th className="border-b border-border px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ya cobró</th>
                      <th className="border-b border-border px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Solicitado</th>
                      <th className="border-b border-border px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Se le debe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={`${r.role}-${r.id}`} className="hover:bg-admin-row-hover" data-liability-row={r.role}>
                        <td className="h-11 border-b border-border px-3 align-middle">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={cn('inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-xs font-semibold', r.role === 'store' ? 'bg-info/15 text-info-ink' : 'bg-primary/15 text-primary-ink')}>{r.role === 'store' ? 'Tienda' : 'Repartidor'}</span>
                            <EntityLink type={r.role === 'store' ? 'store' : 'driver'} id={r.id} label={r.name} />
                          </span>
                        </td>
                        <td className="h-11 border-b border-border px-3 text-right align-middle tabular-nums text-muted-foreground">{money(r.earned)}</td>
                        <td className="h-11 border-b border-border px-3 text-right align-middle tabular-nums text-muted-foreground">{money(r.paid)}</td>
                        <td className={cn('h-11 border-b border-border px-3 text-right align-middle tabular-nums', r.pending > 0 ? 'text-warning-ink' : 'text-muted-foreground')}>{r.pending > 0 ? money(r.pending) : '—'}</td>
                        <td className="h-11 border-b border-border px-3 text-right align-middle font-semibold tabular-nums">{money(r.owed)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">Total del circuito (coincide con la tarjeta &quot;Se debe&quot;)</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums" data-testid="liability-footer-total">{money(circuitTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
