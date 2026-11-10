'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRequireRole } from '@/hooks/use-require-role';
import { money } from '@/lib/format-money';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { useDoc, useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { doc, collection, query, where, orderBy, getDoc, Timestamp } from 'firebase/firestore';
import { storeNetForOrder, FALLBACK_COMMISSION } from '@/lib/money';
import { STORE_LIVE_STATUSES } from '@/lib/order-service';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Package, Tag, ListOrdered, Star, Wallet, BarChart3,
  AlertTriangle, Pencil, ExternalLink, ChevronRight, type LucideIcon,
} from 'lucide-react';
import { normalizeSchedule, getStoreOpenStatus, describeSchedule, isStorePaused } from '@/lib/store-hours';
import { formatCategoryLabel, getCategoryStyle } from '@/lib/category-style';
import { StorePauseControl } from '@/components/store-pause-control';
import { StoreComplianceCard } from '@/components/store-compliance-card';
import { SuspensionNotice } from '@/components/suspension-notice';
import { HolidayHoursCard } from '@/components/holiday-hours-card';
import { CategoryTile } from '@/components/category-tile';
import { Garland } from '@/components/garland';
import { StoreComanda, type ComandaOrder } from '@/components/store-comanda';
import { StoreCountUp } from '@/components/store-count-up';
import { cn } from '@/lib/utils';

// Dashboard de la tienda — modelo A "Pizarra" del rediseño en vidrio (9/11/2026):
// encabezado del local (rubro, estado, rating, pausa), tablero 2x2, comanda que se imprime
// con los pedidos para confirmar y los accesos en una lista agrupada. Mismos datos y mismas
// fórmulas que antes (storeNetForOrder para "Tuyo de hoy"; el saldo NO se recalcula acá).

const PRODUCT_STATES = ['Pendiente de Pago', 'En preparación', 'En reparto', 'En camino'];
const PENDING = 'Pendiente de Confirmación';

export default function StoreDashboardPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();

  const storeId = userProfile?.storeId;

  // ARQ-010: guard único + `ready` para no armar consultas antes de confirmar el rol.
  const { ready } = useRequireRole('store');

  // --- Tienda ---
  const storeRef = useMemoFirebase(
    () => (firestore && storeId && ready ? doc(firestore, 'stores', storeId) : null),
    [firestore, storeId, ready]
  );
  const { data: store, isLoading: storeLoading } = useDoc<any>(storeRef);

  // --- Pedidos ---
  // 🚨 PERF-002 (auditoría oct 2026): antes bajaba TODO el historial de la tienda para
  // contar 4 números. Ahora: listener de nuevos + en curso (acotado) y, aparte, solo los
  // pedidos creados HOY (índice `orders(storeId, createdAt)`) para "entregados hoy".
  // La misma consulta en vivo alimenta la comanda (los 'Pendiente de Confirmación').
  const liveQuery = useMemoFirebase(
    () => (firestore && storeId && ready
      ? query(collection(firestore, 'orders'), where('storeId', '==', storeId), where('status', 'in', STORE_LIVE_STATUSES))
      : null),
    [firestore, storeId, ready]
  );
  const { data: liveOrders, isLoading: liveLoading } = useCollection<any>(liveQuery);
  const todayQuery = useMemoFirebase(
    () => {
      if (!firestore || !storeId || !ready) return null;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      return query(collection(firestore, 'orders'), where('storeId', '==', storeId), where('createdAt', '>=', Timestamp.fromDate(startOfToday)), orderBy('createdAt', 'desc')); // índice (storeId, createdAt DESC)
    },
    [firestore, storeId, ready]
  );
  const { data: todayOrders, isLoading: todayLoading } = useCollection<any>(todayQuery);

  // "Ya cargó" = la consulta en vivo pasó por isLoading=true y volvió a false. Al armarse la
  // consulta, useCollection arranca un render con isLoading=false y data vacía: sin esta
  // guarda la comanda tomaría ese vacío como carga inicial y sonaría con los pedidos viejos.
  const [liveLoaded, setLiveLoaded] = useState(false);
  const sawLiveLoading = useRef(false);
  useEffect(() => {
    if (!liveQuery) return;
    if (liveLoading) sawLiveLoading.current = true;
    else if (sawLiveLoading.current) setLiveLoaded(true);
  }, [liveQuery, liveLoading]);

  // --- Productos (items + legacy 'products') para el aviso de stock bajo ---
  const itemsQuery = useMemoFirebase(
    () => (firestore && storeId && ready ? query(collection(firestore, 'stores', storeId, 'items')) : null),
    [firestore, storeId, ready]
  );
  const { data: items } = useCollection<any>(itemsQuery);
  const legacyQuery = useMemoFirebase(
    () => (firestore && storeId && ready ? query(collection(firestore, 'stores', storeId, 'products')) : null),
    [firestore, storeId, ready]
  );
  const { data: legacyItems } = useCollection<any>(legacyQuery);

  // Comisión por defecto (para tiendas sin tarifa propia) — mismo fallback que la billetera.
  const [defaultCommission, setDefaultCommission] = useState(FALLBACK_COMMISSION);
  useEffect(() => {
    if (!firestore) return;
    getDoc(doc(firestore, 'config', 'platform'))
      .then(s => {
        const v = Number(s.data()?.defaultCommissionRate);
        if (Number.isFinite(v) && v > 0) setDefaultCommission(v);
      })
      .catch(() => {});
  }, [firestore]);

  // Reloj de un minuto: el renglón "Abierta · cierra 23:00" y una pausa con hora de fin se
  // actualizan solos aunque nadie escriba la tienda.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    const live = liveOrders || [];
    const pending = live.filter(o => o.status === PENDING);
    const active = live.filter(o => PRODUCT_STATES.includes(o.status));
    const deliveredToday = (todayOrders || []).filter(o => o.status === 'Entregado');
    // 🚨 Fase PP (N2): antes era `total − envío`, o sea subtotal + TARIFA DE SERVICIO —
    // le atribuía a la tienda plata de la plataforma, sin comisión, sin reembolsos y sin
    // excluir efectivo (justo el error que money.ts corrigió en las billeteras). La
    // tarjeta enlaza a la billetera: ahora muestran el MISMO criterio (neto real).
    const storeRate = store?.commissionRate;
    const fallbackRate = (typeof storeRate === 'number' && storeRate > 0) ? storeRate : defaultCommission;
    const salesToday = deliveredToday.reduce((sum, o) => sum + storeNetForOrder(o, fallbackRate), 0);

    return {
      pending: pending as ComandaOrder[],
      pendingCount: pending.length,
      activeCount: active.length,
      deliveredTodayCount: deliveredToday.length,
      salesToday: Math.round(salesToday),
    };
  }, [liveOrders, todayOrders, store, defaultCommission]);

  const allProducts = useMemo(() => [...(items || []), ...(legacyItems || [])], [items, legacyItems]);
  const lowStock = useMemo(() => allProducts.filter(p => p.stock != null && p.stock <= 3), [allProducts]);

  if (authLoading || storeLoading) {
    return (
      <div className="container mx-auto space-y-4 py-6">
        <Skeleton className="h-40 w-full rounded-card" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-card" />)}
        </div>
      </div>
    );
  }

  const openStatus = getStoreOpenStatus(normalizeSchedule(store), new Date(now));
  const paused = isStorePaused(store, now);
  const category = store?.category || '';
  const catStyle = getCategoryStyle(category);
  const rating = Number(store?.rating) || 0;
  const ratingCount = Number(store?.ratingCount) || 0;
  const openLine = paused
    ? 'Pausada por vos'
    : openStatus.isOpen
      ? (openStatus.closesAt ? `Abierta · cierra ${openStatus.closesAt}` : 'Abierta')
      : `Cerrada · ${describeSchedule(store, new Date(now))}`;
  const liveValue = (n: number) => (liveLoaded ? n : null);

  return (
    <div className="container mx-auto space-y-4 pb-20 pt-2">
      {/* Suspensión con debido proceso (Fase YY ter): motivo, hasta cuándo y "Apelar". */}
      <SuspensionNotice />
      {/* Diciembre: recordatorio de cargar el horario del 24 y el 31. */}
      <HolidayHoursCard store={store} />

      {/* ── Encabezado del local ── */}
      <Card className="relative space-y-4 p-4 sm:p-5" data-testid="store-hero">
        <Garland />
        <div className="flex items-start gap-4">
          <CategoryTile category={category} size="md" className="sm:h-[4rem] sm:w-[4rem] sm:rounded-[1.25rem]" />
          <div className="min-w-0 flex-1">
            <h1 className="break-words font-headline text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              {store?.name || 'Mi tienda'}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-semibold">
              {category && <span className={catStyle.text}>{formatCategoryLabel(category)}</span>}
              <span data-testid="store-open-line" className={paused ? 'text-warning' : openStatus.isOpen ? 'text-success' : 'text-muted-foreground'}>
                {openLine}
              </span>
              <Link href="/my-store/reviews" className="inline-flex min-h-9 items-center gap-1 rounded-full text-muted-foreground hover:text-foreground">
                <Star className="h-4 w-4 fill-warning text-warning" aria-hidden="true" />
                {rating.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span className="font-normal">· {ratingCount} reseña{ratingCount === 1 ? '' : 's'}</span>
              </Link>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button asChild variant="outline" className="h-11 w-11 rounded-full bg-transparent p-0 sm:w-auto sm:px-4" aria-label="Editar la tienda">
              <Link href="/my-store/edit"><Pencil aria-hidden="true" /><span className="hidden sm:inline">Editar</span></Link>
            </Button>
            {storeId && (
              <Button asChild variant="ghost" className="h-11 w-11 rounded-full p-0 sm:w-auto sm:px-4" aria-label="Ver mi tienda como cliente">
                <Link href={`/stores/${storeId}`} target="_blank"><ExternalLink aria-hidden="true" /><span className="hidden sm:inline">Ver</span></Link>
              </Button>
            )}
          </div>
        </div>
        {/* Pausa con tiempo (Fase YY: 30 min / 1 h / hasta reactivar). Componente único. */}
        <StorePauseControl
          storeId={storeId}
          variant="inset"
          activeDescription="Si te quedás sin cocina o sin stock, pausá: no te entran pedidos nuevos."
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          {/* ── Tablero 2x2 ── */}
          <div className="grid grid-cols-2 gap-3" data-testid="store-board">
            <BoardTile label="Pedidos nuevos" href="/orders?tab=pending" testId="board-pending"
              value={liveValue(stats.pendingCount)} tone={stats.pendingCount > 0 ? 'hot' : 'plain'} />
            <BoardTile label="En curso" href="/orders" testId="board-active" value={liveValue(stats.activeCount)} />
            <BoardTile label="Entregados hoy" href="/orders?tab=history" testId="board-delivered"
              value={todayLoading ? null : stats.deliveredTodayCount} />
            <BoardTile label="Tuyo de hoy (neto)" href="/my-store/wallet" testId="board-net" tone="money"
              value={todayLoading ? null : stats.salesToday} format={money} />
          </div>

          {/* ── Comanda: pedidos para confirmar, se imprimen y suenan al entrar ── */}
          <StoreComanda orders={stats.pending} loaded={liveLoaded} user={user} storeId={storeId} />
        </div>

        <div className="min-w-0 space-y-4">
          {lowStock.length > 0 && (
            <Card className="flex items-start gap-3 p-4" data-testid="low-stock-alert">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-bold">{lowStock.length} producto{lowStock.length === 1 ? '' : 's'} con stock bajo</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {lowStock.slice(0, 4).map(p => `${p.name || 'Sin nombre'} (${p.stock})`).join(' · ')}
                </p>
                <Button asChild variant="link" className="h-11 px-0 text-base">
                  <Link href="/my-store/products">Gestionar stock <ChevronRight aria-hidden="true" /></Link>
                </Button>
              </div>
            </Card>
          )}

          {/* ── Accesos en lista agrupada ── */}
          <section aria-labelledby="store-access-title" className="space-y-2">
            <h2 id="store-access-title" className="px-1 font-headline text-2xl font-extrabold">Tu negocio</h2>
            <Card className="divide-y divide-foreground/10 overflow-hidden py-1" data-testid="store-access">
              <AccessRow href="/orders" icon={ListOrdered} label="Pedidos"
                hint={liveLoaded ? `${stats.activeCount} en curso` : undefined} />
              <AccessRow href="/my-store/products" icon={Package} label="Productos" hint={String(allProducts.length)} />
              <AccessRow href="/my-store/categories" icon={Tag} label="Categorías" />
              <AccessRow href="/my-store/wallet" icon={Wallet} label="Billetera" hint="Saldo y retiros" />
              <AccessRow href="/my-store/reviews" icon={Star} label="Reseñas"
                hint={`${rating.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · ${ratingCount}`} />
              <AccessRow href="/my-store/analytics" icon={BarChart3} label="Analíticas" />
            </Card>
          </section>
        </div>
      </div>

      {/* Cumplimiento (Fase YY, punto 4): aceptación y tiempos, por aggregation */}
      <StoreComplianceCard storeId={storeId} enabled={ready} variant="owner" />
    </div>
  );
}

function BoardTile({ label, value, href, tone = 'plain', format, testId }: {
  label: string; value: number | null; href: string; tone?: 'plain' | 'hot' | 'money';
  format?: (n: number) => string; testId: string;
}) {
  return (
    <Link href={href} className="group block min-w-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={testId}>
      <Card className="h-full p-4 transition-transform duration-200 ease-spring group-hover:-translate-y-0.5 group-active:scale-[0.98]">
        <span className="block text-sm font-semibold text-muted-foreground">{label}</span>
        <StoreCountUp
          value={value}
          format={format ?? ((n: number) => String(Math.round(n)))}
          className={cn(
            'mt-1 block truncate font-headline text-4xl font-extrabold leading-none tabular-nums',
            tone === 'hot' && 'text-primary',
            tone === 'money' && 'text-success',
          )}
        />
      </Card>
    </Link>
  );
}

function AccessRow({ href, icon: Icon, label, hint }: { href: string; icon: LucideIcon; label: string; hint?: string }) {
  return (
    <Link
      href={href}
      className="relative flex min-h-[3.75rem] items-center gap-4 px-4 py-2 transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.06] focus-visible:outline-none"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[0.8rem] bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 font-semibold">{label}</span>
      {hint && <span className="shrink-0 text-sm font-semibold text-muted-foreground">{hint}</span>}
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
