'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { money } from '@/lib/format-money';
import { fmtElapsed } from '@/lib/format-date';
import { FINANCE_PERIOD_LABELS, type FinancePeriod } from '@/lib/platform-daily';
import { Button } from '@/components/ui/button';
import { PctBadge } from '@/components/pct-badge';
import AdminAuthGuard from '../admin-auth-guard';
import { AdminPage } from '@/components/admin/admin-page';
import { KpiCard, KpiRow } from '@/components/admin/kpi-card';
import { PeriodPicker } from '@/components/admin/period-picker';
import { ErrorState } from '@/components/admin/error-state';
import { useDailyStats } from './use-daily-stats';
import { DailyNetChart } from './daily-chart';
import { LiabilityPanel } from './liability-panel';
import { MonthlyHistory } from './monthly-history';

const PERIODS: { value: FinancePeriod; label: string }[] = (['7d', '30d', 'month', 'prevMonth', 'year'] as FinancePeriod[]).map(p => ({ value: p, label: FINANCE_PERIOD_LABELS[p] }));

/**
 * Resumen financiero (full) — Tanda T2. Lo que gana la APP (tarifas + comisiones, netas de
 * reembolsos) por período leído de los cierres DIARIOS (`platform_daily`) + hoy en vivo;
 * comparación contra el período anterior equivalente; neto por día; pasivo real filtrable por
 * circuito; historial mensual con desglose. Fórmulas 100 % de money.ts (vía
 * aggregateDailyOrders). La tabla de retiros vive en "Pagos a cuentas".
 */
function FinancesInner() {
  const { isFullAdmin } = useAuth();
  const [period, setPeriod] = useState<FinancePeriod>('30d');
  const stats = useDailyStats(period, isFullAdmin);
  const cur = stats.loading ? null : stats.current;
  const prev = stats.previous;
  const cmp = (key: 'platform' | 'serviceFees' | 'commissions' | 'refunds' | 'delivered' | 'avgTicket' | 'ordersCreated') =>
    cur && prev ? <span className="inline-flex items-center gap-1"><PctBadge current={cur[key]} prev={prev[key]} /><span>{stats.bounds?.compareLabel}</span></span> : (stats.bounds?.compareLabel ? undefined : 'sin comparación en este período');
  const v = (key: keyof NonNullable<typeof cur>) => (stats.error ? '—' : cur ? Number(cur[key] ?? 0) : null);
  const cancelledTotal = cur ? cur.cancelled + cur.rejected : null;
  const cancelRate = cur && cur.ordersCreated > 0 ? Math.round(((cur.cancelled + cur.rejected) / cur.ordersCreated) * 1000) / 10 : null;

  return (
    <AdminPage
      title="Resumen financiero"
      subtitle={<>Lo que gana la app: tarifa de servicio + comisiones, neto de reembolsos, por fecha de creación del pedido. {stats.refreshedAt ? <span className="text-xs">· {stats.reads} lecturas · actualizado hace {fmtElapsed(Date.now() - stats.refreshedAt)}</span> : null}</>}
      crumbs={[{ label: 'Finanzas' }, { label: 'Resumen financiero' }]}
      actions={
        <>
          <PeriodPicker value={period} onChange={setPeriod} options={PERIODS} />
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={stats.refresh} disabled={stats.loading} aria-label="Recalcular el período">
            <RefreshCw className={stats.loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" /> <span className="hidden sm:inline">Refrescar</span>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5"><Link href="/admin/finances/payouts"><Wallet className="h-4 w-4" aria-hidden="true" /> Pagos a cuentas</Link></Button>
        </>
      }
      kpis={
        <div className="space-y-3">
          {stats.error ? <ErrorState compact error={stats.error} onRetry={stats.refresh} /> : null}
          <KpiRow cols={6}>
            <KpiCard testId="kpi-platform" label="Ganancia neta de la app" value={v('platform')} format="money" tone="success" hint={cmp('platform')} />
            <KpiCard testId="kpi-fees" label="Tarifas de servicio" value={v('serviceFees')} format="money" hint={cmp('serviceFees')} />
            <KpiCard testId="kpi-commissions" label="Comisiones a tiendas" value={v('commissions')} format="money" hint={cmp('commissions')} />
            <KpiCard testId="kpi-refunds" label="Reembolsos" value={v('refunds')} format="money" tone={cur && cur.refunds > 0 ? 'warning' : 'default'} hint={cur ? `${cur.refundedOrders} pedido${cur.refundedOrders === 1 ? '' : 's'} · ya descontados del neto` : undefined} />
            <KpiCard testId="kpi-delivered" label="Pedidos entregados" value={v('delivered')} hint={cmp('delivered')} />
            <KpiCard testId="kpi-ticket" label="Ticket promedio" value={v('avgTicket')} format="money" hint={cmp('avgTicket')} />
          </KpiRow>
          <KpiRow cols={5}>
            <KpiCard testId="kpi-created" label="Pedidos creados" value={v('ordersCreated')} hint={cmp('ordersCreated')} />
            <KpiCard testId="kpi-cancelled" label="Cancelados + rechazados" value={stats.error ? '—' : cancelledTotal} tone={cancelledTotal ? 'destructive' : 'default'} hint={cancelRate !== null ? `${cancelRate.toLocaleString('es-AR')} % de los creados` : undefined} />
            <KpiCard testId="kpi-revenue" label="Facturado bruto" value={v('revenue')} format="money" hint="suma de totales de los entregados, sin descontar reembolsos" />
            <KpiCard testId="kpi-split" label="A tiendas (neto)" value={v('toStores')} format="money" hint={cur ? <span data-testid="kpi-split-drivers">a repartidores {money(cur.toDrivers)} · ambos netos</span> : undefined} />
            <KpiCard testId="kpi-delivery-time" label="Creación → entrega" value={cur ? (cur.avgDeliveryMin === null ? '—' : Math.round(cur.avgDeliveryMin)) : stats.error ? '—' : null} format={cur && cur.avgDeliveryMin !== null ? 'minutes' : 'text'} suffix={cur && cur.avgDeliveryMin !== null ? 'min' : undefined} hint={cur ? `promedio sobre ${cur.deliveryTimedCount} entregados con hora de entrega` : undefined} />
          </KpiRow>
        </div>
      }
    >
      <DailyNetChart days={stats.days} loading={stats.loading} />
      <LiabilityPanel />
      <MonthlyHistory today={stats.today} todayId={stats.todayId} fallbackRate={stats.fallbackRate} />
      <p className="text-xs text-muted-foreground">
        Los días cerrados se precalculan en <code>platform_daily</code> con el cron de conciliación (13:30 UTC) y con &quot;Conciliar ahora&quot; en Conciliación MP; el día en curso se suma en vivo. Un reembolso registrado hoy sobre un pedido de ayer se refleja en el cierre de ayer en la próxima corrida.
      </p>
    </AdminPage>
  );
}

export default function AdminFinancesPage() {
  return <AdminAuthGuard requireFullAdmin><FinancesInner /></AdminAuthGuard>;
}
