'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, count, getCountFromServer, limit, orderBy, query, sum, Timestamp, where, type Query } from 'firebase/firestore';
import {
  Bike, CheckCircle2, ChefHat, ChevronDown, Clock, CreditCard, Inbox, PackageCheck, Pause, RefreshCw, Store as StoreIcon, Truck, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { db, useCollection, useMemoFirebase } from '@/lib/firebase';
import { useAggregate, useCountFromServer } from '@/lib/firebase-aggregate';
import { money } from '@/lib/format-money';
import { fmtDate, fmtElapsed, startOfDayArgentina, weekdayShort } from '@/lib/format-date';
import { ADMIN_ACTIVE_STATUSES } from '@/lib/order-stuck';
import type { Order } from '@/lib/order-service';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AdminPage } from '@/components/admin/admin-page';
import { KpiCard, KpiRow } from '@/components/admin/kpi-card';
import { InboxList } from '@/components/admin/inbox-list';
import { useInboxItems } from '@/components/admin/use-inbox';
import { useAdminCounts } from '@/components/admin/use-admin-counts';
import { StatusBadge } from '@/components/admin/status-badge';
import { EntityLink } from '@/components/admin/entity-link';
import { ErrorState } from '@/components/admin/error-state';

/* Etapas del flujo EN ORDEN. El color progresa según de quién depende: gris (el sistema
   espera) → ámbar (la pelota la tiene la tienda) → azul (ya está en la calle). */
const PIPELINE_STAGES = [
  { status: 'Pendiente de Confirmación', label: 'Sin confirmar',   who: 'la tienda debe confirmar',        icon: Clock,        ink: 'text-warning-ink', soft: 'bg-warning/10 border-warning/60' },
  { status: 'Pendiente de Pago',         label: 'Sin pagar',       who: 'el cliente debe pagar',           icon: CreditCard,   ink: 'text-muted-foreground', soft: 'bg-muted/40 border-border' },
  { status: 'En preparación',            label: 'En preparación',  who: 'en la tienda',                    icon: ChefHat,      ink: 'text-warning-ink', soft: 'bg-warning/10 border-warning/60' },
  { status: 'Listo para recoger',        label: 'Listo',           who: 'falta que lo tome un repartidor', icon: PackageCheck, ink: 'text-warning-ink', soft: 'bg-warning/10 border-warning/60' },
  { status: 'En camino',                 label: 'En camino',       who: 'yendo a la tienda',               icon: Bike,         ink: 'text-info-ink',    soft: 'bg-info/10 border-info/60' },
  { status: 'En reparto',                label: 'En reparto',      who: 'yendo al cliente',                icon: Truck,        ink: 'text-info-ink',    soft: 'bg-info/10 border-info/60' },
] as const;

const HISTORIC_FOCUS_MS = 5 * 60_000;

/**
 * Resumen (dashboard) — Tanda T1. SIN el listener de "pedidos de los últimos 30 días" (600 ·
 * 4.500 · 22.500 lecturas por carga según el modelo de tráfico): todo lo de "hoy" sale de
 * aggregations con rango (índices (status, createdAt, campo)) y lo "en vivo" del set chico de
 * activos. Las analíticas por tienda/repartidor y la tendencia de neto llegan con los cierres
 * diarios (`platform_daily`, T2) — acá queda una tendencia interina de pedidos por día (7 counts).
 */
export default function AdminResumenPage() {
  const { isAdmin, isFullAdmin } = useAuth();
  const counts = useAdminCounts();
  const inbox = useInboxItems();
  const active = inbox.raw.activeOrders;
  const now = inbox.now;

  // "Hoy" en hora ARGENTINA, estable durante el día (no cambia con cada tick del reloj).
  const dayKey = fmtDate(now, 'date');
  const todayStart = useMemo(() => startOfDayArgentina(new Date(now)), [dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const sevenDaysAgo = useMemo(() => startOfDayArgentina(new Date(now), -6), [dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tsToday = useMemo(() => Timestamp.fromDate(todayStart), [todayStart]);
  const ts7d = useMemo(() => Timestamp.fromDate(sevenDaysAgo), [sevenDaysAgo]);

  const ordersCol = useMemo(() => collection(db, 'orders'), []);
  const q = (b: () => Query) => (isAdmin ? b() : null);

  /* ── KPIs de hoy (interino por aggregation; ★ platform_daily en T2) ──────────── */
  const ordersTodayQ = useMemoFirebase(() => q(() => query(ordersCol, where('createdAt', '>=', tsToday))), [isAdmin, ordersCol, tsToday]);
  const deliveredTodayQ = useMemoFirebase(() => q(() => query(ordersCol, where('status', '==', 'Entregado'), where('createdAt', '>=', tsToday))), [isAdmin, ordersCol, tsToday]);
  const cancelledTodayQ = useMemoFirebase(() => q(() => query(ordersCol, where('status', 'in', ['Cancelado', 'Rechazado']), where('createdAt', '>=', tsToday))), [isAdmin, ordersCol, tsToday]);
  const ordersToday = useCountFromServer(ordersTodayQ);
  const deliveredToday = useCountFromServer(deliveredTodayQ);
  const cancelledToday = useCountFromServer(cancelledTodayQ);
  // Dos aggregations SEPARADAS (regla de la Fase HH: una sum por campo, cada una con su índice).
  const feesToday = useAggregate(deliveredTodayQ, { v: sum('serviceFee') });
  const commissionToday = useAggregate(deliveredTodayQ, { v: sum('commissionAmount') });

  const driversApprovedQ = useMemoFirebase(() => q(() => query(collection(db, 'users'), where('role', '==', 'delivery'), where('isApproved', '==', true))), [isAdmin]);
  const driversOfflineQ = useMemoFirebase(() => q(() => query(collection(db, 'users'), where('role', '==', 'delivery'), where('isApproved', '==', true), where('isOnline', '==', false))), [isAdmin]);
  const driversApproved = useCountFromServer(driversApprovedQ);
  const driversOffline = useCountFromServer(driversOfflineQ);

  const claims7dQ = useMemoFirebase(() => q(() => query(collection(db, 'claims'), where('createdAt', '>=', ts7d))), [isAdmin, ts7d]);
  const orders7dQ = useMemoFirebase(() => q(() => query(ordersCol, where('createdAt', '>=', ts7d))), [isAdmin, ordersCol, ts7d]);
  const delivered7dQ = useMemoFirebase(() => q(() => query(ordersCol, where('status', '==', 'Entregado'), where('createdAt', '>=', ts7d))), [isAdmin, ordersCol, ts7d]);
  const claims7d = useCountFromServer(claims7dQ);
  const orders7d = useCountFromServer(orders7dQ);
  const delivered7d = useCountFromServer(delivered7dQ);

  const storesApprovedQ = useMemoFirebase(() => q(() => query(collection(db, 'stores'), where('isApproved', '==', true))), [isAdmin]);
  const storesPausedQ = useMemoFirebase(() => q(() => query(collection(db, 'stores'), where('isApproved', '==', true), where('manuallyPaused', '==', true))), [isAdmin]);
  const storesApproved = useCountFromServer(storesApprovedQ);
  const storesPaused = useCountFromServer(storesPausedQ);

  /* ── Totales históricos (aggregations, foco cada 5 min) ───────────────────── */
  const deliveredAllQ = useMemoFirebase(() => q(() => query(ordersCol, where('status', '==', 'Entregado'))), [isAdmin, ordersCol]);
  const deliveredAgg = useAggregate(deliveredAllQ, { revenue: sum('total'), completed: count() }, { refreshOnFocus: true, focusIntervalMs: HISTORIC_FOCUS_MS });
  const feesAgg = useAggregate(deliveredAllQ, { total: sum('serviceFee') }, { refreshOnFocus: true, focusIntervalMs: HISTORIC_FOCUS_MS });
  const shippingAgg = useAggregate(deliveredAllQ, { total: sum('deliveryFee') }, { refreshOnFocus: true, focusIntervalMs: HISTORIC_FOCUS_MS });
  const commissionAgg = useAggregate(deliveredAllQ, { total: sum('commissionAmount') }, { refreshOnFocus: true, focusIntervalMs: HISTORIC_FOCUS_MS });
  const usersQ = useMemoFirebase(() => q(() => query(collection(db, 'users'), where('role', '!=', 'admin'))), [isAdmin]);
  const buyersQ = useMemoFirebase(() => q(() => query(collection(db, 'users'), where('role', '==', 'buyer'))), [isAdmin]);
  const storeUsersQ = useMemoFirebase(() => q(() => query(collection(db, 'users'), where('role', '==', 'store'))), [isAdmin]);
  const driverUsersQ = useMemoFirebase(() => q(() => query(collection(db, 'users'), where('role', '==', 'delivery'))), [isAdmin]);
  const allOrdersQ = useMemoFirebase(() => (isAdmin ? ordersCol : null), [isAdmin, ordersCol]);
  const totalUsers = useCountFromServer(usersQ, { refreshOnFocus: true, focusIntervalMs: HISTORIC_FOCUS_MS });
  const buyersCount = useCountFromServer(buyersQ, { refreshOnFocus: true, focusIntervalMs: HISTORIC_FOCUS_MS });
  const storeUsersCount = useCountFromServer(storeUsersQ, { refreshOnFocus: true, focusIntervalMs: HISTORIC_FOCUS_MS });
  const driverUsersCount = useCountFromServer(driverUsersQ, { refreshOnFocus: true, focusIntervalMs: HISTORIC_FOCUS_MS });
  const allOrdersCount = useCountFromServer(allOrdersQ, { refreshOnFocus: true, focusIntervalMs: HISTORIC_FOCUS_MS });

  /* ── Tendencia interina: pedidos por día (7 counts, 1 lectura c/u a esta escala) ── */
  const [trend, setTrend] = useState<{ label: string; n: number }[] | null>(null);
  const [trendError, setTrendError] = useState<unknown>(null);
  const [trendTick, setTrendTick] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const days = Array.from({ length: 7 }, (_, i) => startOfDayArgentina(new Date(now), i - 6));
    Promise.all(days.map((d, i) => {
      const from = Timestamp.fromDate(d);
      const to = Timestamp.fromDate(i < 6 ? days[i + 1] : startOfDayArgentina(new Date(now), 1));
      return getCountFromServer(query(ordersCol, where('createdAt', '>=', from), where('createdAt', '<', to))).then(s => ({ label: weekdayShort(d), n: s.data().count }));
    })).then(r => { if (!cancelled) { setTrend(r); setTrendError(null); } })
      .catch(e => { if (!cancelled) setTrendError(e); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, ordersCol, dayKey, trendTick]);

  /* ── Pedidos recientes (10) ───────────────────────────────────────────────── */
  const recentQ = useMemoFirebase(() => q(() => query(ordersCol, orderBy('createdAt', 'desc'), limit(10))), [isAdmin, ordersCol]);
  const recent = useCollection<Order>(recentQ);

  const refreshAll = useCallback(() => {
    void counts.refresh();
    [ordersToday, deliveredToday, cancelledToday, driversApproved, driversOffline, claims7d, orders7d, delivered7d, storesApproved, storesPaused,
      totalUsers, buyersCount, storeUsersCount, driverUsersCount, allOrdersCount].forEach(c => void c.refresh());
    [feesToday, commissionToday, deliveredAgg, feesAgg, shippingAgg, commissionAgg].forEach(a => void a.refresh());
    setTrendTick(t => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Derivados en vivo ─────────────────────────────────────────────────────── */
  const byStatus = useMemo(() => {
    const m: Record<string, number> = {};
    active.forEach(o => { m[o.status] = (m[o.status] || 0) + 1; });
    return m;
  }, [active]);
  const totalActive = active.length;
  const inStore = PIPELINE_STAGES.slice(0, 4).reduce((s, st) => s + (byStatus[st.status] || 0), 0);
  const inStreet = PIPELINE_STAGES.slice(4).reduce((s, st) => s + (byStatus[st.status] || 0), 0);
  const waitingDriver = byStatus['Listo para recoger'] || 0;
  const stuckItems = inbox.items.filter(i => i.kind === 'stuck');
  const oldestStuck = stuckItems.reduce<number | null>((acc, it) => (it.since !== null && (acc === null || it.since < acc) ? it.since : acc), null);

  const driversOnline = driversApproved.count === null || driversOffline.count === null ? null : Math.max(0, driversApproved.count - driversOffline.count);
  const grossToday = feesToday.data && commissionToday.data ? (feesToday.data.v ?? 0) + (commissionToday.data.v ?? 0) : null;
  const claimsPer100 = claims7d.count === null || orders7d.count === null ? null : (orders7d.count > 0 ? (claims7d.count / orders7d.count) * 100 : 0);
  const pendingApprovals = counts.counts.pendingStores === null || counts.counts.pendingDrivers === null ? null : (counts.counts.pendingStores ?? 0) + (counts.counts.pendingDrivers ?? 0);
  const storesOperating = storesApproved.count === null || storesPaused.count === null ? null : Math.max(0, storesApproved.count - storesPaused.count);
  const inboxTotal = counts.inboxTotal === null ? null : counts.inboxTotal + inbox.stuckCount;

  const revenue = deliveredAgg.data?.revenue ?? null;
  const completed = deliveredAgg.data?.completed ?? null;
  const fees = feesAgg.data?.total ?? 0;
  const shipping = shippingAgg.data?.total ?? 0;
  const commission = commissionAgg.data?.total ?? 0;
  const products = revenue === null ? 0 : Math.max(0, revenue - fees - shipping);
  const toStores = Math.max(0, products - commission);
  const toPlatform = fees + commission;
  const avgTicket = revenue !== null && completed ? revenue / completed : 0;
  const deliveryRate = completed !== null && allOrdersCount.count ? Math.round((completed / allOrdersCount.count) * 100) : null;
  const maxTrend = Math.max(1, ...(trend ?? []).map(t => t.n));

  return (
    <AdminPage
      title="Resumen"
      subtitle={<span className="first-letter:uppercase">{new Date(now).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · pedidos en curso en vivo, totales del día por consulta</span>}
      crumbs={[{ label: 'Hoy' }, { label: 'Resumen' }]}
      live
      actions={
        <>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refrescar
          </Button>
          <Button asChild size="sm" className="h-9 gap-1.5">
            <Link href="/admin/inbox"><Inbox className="h-4 w-4" aria-hidden="true" /> Bandeja{inboxTotal !== null ? ` (${inboxTotal})` : ''}</Link>
          </Button>
        </>
      }
    >
      {/* ── KPIs de hoy ───────────────────────────────────────────────────── */}
      <KpiRow cols={6}>
        <KpiCard testId="kpi-orders-today" label="Pedidos hoy" value={ordersToday.count} error={ordersToday.error} onRetry={ordersToday.refresh}
          hint={ordersToday.count !== null ? `${deliveredToday.count ?? '…'} entregados · ${cancelledToday.count ?? '…'} cancelados` : undefined} href="/admin/orders?date=7d" />
        <KpiCard testId="kpi-gross-today" label="Ganancia bruta de la app hoy" value={grossToday} format="money" tone="success"
          error={feesToday.error ?? commissionToday.error} onRetry={() => { void feesToday.refresh(); void commissionToday.refresh(); }}
          hint="tarifas + comisiones de entregados · sin descontar reembolsos" />
        <KpiCard testId="kpi-stuck" label="Trabados ahora" value={inbox.loading ? null : inbox.stuckCount} tone={inbox.stuckCount > 0 ? 'warning' : 'default'}
          hint={oldestStuck !== null ? `el más viejo hace ${fmtElapsed(now - oldestStuck)}` : 'ninguno fuera de umbral'} href="/admin/inbox" />
        <KpiCard testId="kpi-drivers-online" label="Repartidores online" value={driversOnline} suffix={driversApproved.count !== null ? `/ ${driversApproved.count}` : undefined}
          tone={driversOnline === 0 && waitingDriver > 0 ? 'destructive' : 'default'} error={driversApproved.error ?? driversOffline.error}
          hint={waitingDriver > 0 ? `${waitingDriver} pedido${waitingDriver === 1 ? '' : 's'} esperando repartidor` : 'sin pedidos esperando moto'} href="/admin/delivery" />
        <KpiCard testId="kpi-claims-rate" label="Reclamos por 100 pedidos (7 d)" value={claimsPer100 === null ? null : claimsPer100.toLocaleString('es-AR', { maximumFractionDigits: 1 })} format="text"
          error={claims7d.error ?? orders7d.error} hint={claims7d.count !== null && orders7d.count !== null ? `${claims7d.count} reclamos · ${orders7d.count} pedidos` : undefined} href="/admin/claims" />
        {isFullAdmin ? (
          <KpiCard testId="kpi-liability" label="Pasivo (se debe hoy)" value="—" format="text" hint="se calcula a pedido en Finanzas →" href="/admin/finances" />
        ) : (
          <KpiCard label="Tiendas operando" value={storesOperating} hint={storesPaused.count ? `${storesPaused.count} pausadas` : 'ninguna pausada'} href="/admin/stores" />
        )}
      </KpiRow>

      {/* ── Pipeline en vivo ───────────────────────────────────────────────── */}
      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-4 sm:p-5" data-testid="pipeline">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Flujo del pedido <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-success-ink"><span className="h-2 w-2 rounded-full bg-success animate-pulse motion-reduce:animate-none" aria-hidden="true" />en vivo</span></h2>
            <p className="text-xs text-muted-foreground">Tocá una etapa para ver esos pedidos</p>
          </div>
          <Link href="/admin/orders" className="text-right">
            <div className="text-2xl font-bold tabular-nums text-primary-ink">{totalActive}</div>
            <div className="text-xs text-muted-foreground">en curso</div>
          </Link>
        </div>
        {inbox.errors.some(e => e.source === 'Pedidos activos') ? (
          <ErrorState compact error={inbox.errors.find(e => e.source === 'Pedidos activos')?.error} />
        ) : totalActive === 0 && !inbox.loading ? (
          <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success-ink" aria-hidden="true" /> Ningún pedido en curso — todo entregado.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {PIPELINE_STAGES.map(st => {
                const n = byStatus[st.status] || 0;
                const Icon = st.icon;
                return (
                  <Link key={st.status} href={`/admin/orders?status=${encodeURIComponent(st.status)}`}
                    className={cn('min-w-0 rounded-md border p-3 transition-colors hover:bg-admin-row-hover', n > 0 ? st.soft : 'border-border')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className={cn('text-[28px] font-bold leading-none tabular-nums', n > 0 ? st.ink : 'text-muted-foreground/50')}>{n}</div>
                      <Icon className={cn('h-4 w-4 shrink-0', n > 0 ? st.ink : 'text-muted-foreground/40')} aria-hidden="true" />
                    </div>
                    <div className="mt-1 text-sm font-medium">{st.label}</div>
                    <div className={cn('text-xs', n > 0 ? st.ink : 'text-muted-foreground')}>{st.who}</div>
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-warning/10 px-3 py-2"><span className="font-semibold text-warning-ink">{inStore} en la tienda</span> <span className="text-muted-foreground">· {inStore > inStreet ? 'cuello de botella: comercios' : 'comercios al día'}</span></div>
              <div className="rounded-md bg-info/10 px-3 py-2"><span className="font-semibold text-info-ink">{inStreet} en la calle</span> <span className="text-muted-foreground">· {waitingDriver > 0 ? `${waitingDriver} esperando moto` : 'logística al día'}</span></div>
            </div>
          </>
        )}

        {/* Capacidad de la red: ¿tengo con qué operar? */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { href: '/admin/stores', icon: StoreIcon, value: storesOperating, label: 'Tiendas operando', hint: 'aprobadas y sin pausa', tone: 'success' as const },
            { href: '/admin/stores', icon: Pause, value: storesPaused.count, label: 'Tiendas pausadas', hint: 'cortaron pedidos a mano', tone: (storesPaused.count ?? 0) > 0 ? 'warning' as const : 'default' as const },
            { href: '/admin/delivery', icon: Bike, value: driversOnline, label: 'Repartidores online', hint: driversOnline === 0 ? 'nadie puede entregar' : 'aprobados y disponibles', tone: driversOnline === 0 ? 'destructive' as const : 'info' as const },
            { href: '/admin/inbox?tipo=approval', icon: pendingApprovals ? AlertTriangle : CheckCircle2, value: pendingApprovals, label: 'Esperando aprobación', hint: pendingApprovals ? 'no pueden operar todavía' : 'nada pendiente', tone: pendingApprovals ? 'warning' as const : 'default' as const },
          ].map((c) => {
            const Icon = c.icon;
            const ink = c.tone === 'success' ? 'text-success-ink' : c.tone === 'warning' ? 'text-warning-ink' : c.tone === 'destructive' ? 'text-destructive-ink' : c.tone === 'info' ? 'text-info-ink' : 'text-foreground';
            return (
              <Link key={c.label} href={c.href} className="rounded-md border border-border p-3 transition-colors hover:bg-admin-row-hover" aria-busy={c.value === null || undefined}>
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('text-2xl font-bold leading-none tabular-nums', c.value === null ? 'text-muted-foreground' : ink)}>{c.value === null ? '…' : c.value}</span>
                  <Icon className={cn('h-4 w-4 shrink-0', ink)} aria-hidden="true" />
                </div>
                <div className="mt-2 text-[13px] font-medium leading-tight">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.hint}</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Bandeja resumida + tendencia ──────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Requiere tu atención {inboxTotal !== null && inboxTotal > 0 && <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">{inboxTotal > 99 ? '99+' : inboxTotal}</span>}</h2>
            <Link href="/admin/inbox" className="inline-flex min-h-[36px] items-center text-sm font-medium text-primary-ink hover:underline">Ver bandeja →</Link>
          </div>
          <InboxList items={inbox.items} loading={inbox.loading} errors={inbox.errors} now={now} limit={5} moreHref="/admin/inbox" groupBy="none" />
        </div>
        <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-4 lg:col-span-2" data-testid="trend">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Últimos 7 días</h2><span className="text-xs text-muted-foreground">pedidos por día</span></div>
          {trendError ? <ErrorState compact error={trendError} onRetry={() => setTrendTick(t => t + 1)} /> : (
            <>
              <div className="flex h-32 items-end gap-2" aria-label={trend ? `Pedidos por día: ${trend.map(t => `${t.label} ${t.n}`).join(', ')}` : 'Cargando'} aria-busy={!trend || undefined}>
                {(trend ?? Array.from({ length: 7 }, () => ({ label: '', n: 0 }))).map((t, i) => (
                  <div key={i} className={cn('flex-1 rounded-t', i === 6 ? 'bg-primary' : 'bg-primary/40', !trend && 'animate-pulse bg-muted')} style={{ height: `${Math.max(4, (t.n / maxTrend) * 100)}%` }} title={`${t.label}: ${t.n}`} />
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 text-center text-xs text-muted-foreground">{(trend ?? []).map((t, i) => <span key={i}>{t.label}</span>)}</div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Pedidos</dt><dd className="font-medium tabular-nums">{orders7d.count ?? '…'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Entregados</dt><dd className="font-medium tabular-nums text-success-ink">{delivered7d.count ?? '…'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Reclamos / 100 pedidos</dt><dd className="font-medium tabular-nums">{claimsPer100 === null ? '…' : claimsPer100.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">Interino por consultas de conteo (7 lecturas). El neto por día, por tienda y por repartidor llega con los cierres diarios (T2).</p>
            </>
          )}
        </section>
      </div>

      {/* ── Pedidos recientes ──────────────────────────────────────────────── */}
      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card" data-testid="recent-orders">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">Pedidos recientes</h2>
          <Link href="/admin/orders" className="inline-flex min-h-[36px] items-center text-sm font-medium text-primary-ink hover:underline">Ver todos →</Link>
        </div>
        {recent.error ? <ErrorState compact error={recent.error} className="m-3" /> : (recent.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Todavía no hay pedidos.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(recent.data ?? []).map(o => (
              <li key={o.id} className="flex min-h-[48px] items-center gap-3 px-4 py-1.5 text-sm">
                <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{fmtDate(o.createdAt, 'short')}</span>
                <EntityLink type="order" id={o.id} />
                <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">{o.customerName} · {o.storeName}{o.deliveryPersonName ? ` · ${o.deliveryPersonName}` : ''}</span>
                <StatusBadge kind="order" value={o.status} />
                <span className="ml-auto font-semibold tabular-nums">{money(o.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Totales históricos (al final, desglose colapsado) ───────────────── */}
      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-4" data-testid="historic">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Totales históricos</h2>
          <span className="text-xs text-muted-foreground">se refrescan al volver a la pestaña (cada 5 min)</span>
        </div>
        {deliveredAgg.error && <ErrorState compact error={deliveredAgg.error} onRetry={deliveredAgg.refresh} className="mb-3" />}
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard testId="kpi-revenue" label="Facturado bruto (entregados)" value={deliveredAgg.error ? '—' : revenue} format="money" error={undefined}
            hint="suma de totales, sin descontar reembolsos" />
          <KpiCard testId="kpi-users" label="Usuarios registrados" value={totalUsers.count} error={totalUsers.error} onRetry={totalUsers.refresh}
            hint={buyersCount.count !== null ? `${buyersCount.count} compradores · ${storeUsersCount.count ?? '…'} tiendas · ${driverUsersCount.count ?? '…'} repartidores` : undefined} />
          <KpiCard testId="kpi-delivered" label="Pedidos entregados" value={completed} error={deliveredAgg.error}
            hint={allOrdersCount.count !== null && deliveryRate !== null ? `de ${allOrdersCount.count.toLocaleString('es-AR')} en total · tasa ${deliveryRate} %` : undefined}
            tone={deliveryRate === null ? 'default' : deliveryRate >= 70 ? 'success' : deliveryRate >= 40 ? 'warning' : 'destructive'} />
        </div>
        <Collapsible className="mt-3">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground"><ChevronDown className="h-4 w-4" aria-hidden="true" /> Ver desglose bruto</Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {[
                ['Queda en la plataforma (bruto)', money(toPlatform), 'text-success-ink'],
                ['· tarifa de servicio', money(fees), 'text-muted-foreground'],
                ['· comisión a tiendas', money(commission), 'text-muted-foreground'],
                ['A las tiendas (bruto)', money(toStores), ''],
                ['Envíos (a repartidores)', money(shipping), 'text-info-ink'],
                ['Ticket promedio', money(avgTicket), ''],
              ].map(([l, v, c]) => (
                <div key={l} className="flex items-baseline justify-between gap-2"><dt className="text-muted-foreground">{l}</dt><dd className={cn('font-medium tabular-nums', c)}>{v}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Cifras BRUTAS (las aggregations no aplican money.ts: no descuentan reembolsos ni excluyen efectivo).{' '}
              {isFullAdmin && <Link href="/admin/finances" className="text-primary-ink hover:underline">Ver la ganancia neta real en Finanzas →</Link>}
            </p>
          </CollapsibleContent>
        </Collapsible>
      </section>
      <p className="text-xs text-muted-foreground">Pedidos en curso: {ADMIN_ACTIVE_STATUSES.length} estados activos escuchados en vivo. Un pedido se marca trabado según su estado (confirmación ≥1h · pago ≥2h · preparación ≥3h · retiro ≥2h · entrega ≥3h · reparto ≥4h).</p>
    </AdminPage>
  );
}
