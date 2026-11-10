'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRequireRole } from '@/hooks/use-require-role';
import { money } from '@/lib/format-money';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { driverNetForOrder } from '@/lib/money';
import { DRIVER_ACTIVE_STATUSES, MAX_ACTIVE_ORDERS } from '@/lib/order-service';
import { Skeleton } from '@/components/ui/skeleton';
import { DeliveryOnlineToggle } from '@/components/delivery-online-toggle';
import { SuspensionNotice } from '@/components/suspension-notice';
import { DriverJobCard, DriverPendingNotice, type DriverPoolOrder } from '@/components/driver-job-card';
import { useDriverTakeOrder, useDriverPoolSound } from '@/hooks/driver-take-order';
import { cn } from '@/lib/utils';
import {
  Truck, Wallet, Star, BarChart3, ChevronRight, PackageSearch, Bike,
} from 'lucide-react';

const fmtRating = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function DeliveryDashboardPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  // ARQ-010: guard único + `ready` para no armar consultas antes de confirmar el rol.
  const { ready } = useRequireRole('delivery');

  const isApprovedDriver = userProfile?.isApproved === true;
  // Fase YY ter: una cuenta suspendida no está "pendiente": ve el motivo y puede apelar.
  const isSuspended = userProfile?.suspension?.active === true;
  const isOnline = (userProfile as { isOnline?: boolean } | null)?.isOnline !== false;

  // Mismas queries que delivery-orders-view.tsx (panel operativo): el rango de estados del
  // pool tiene que coincidir EXACTO con firestore.rules (si no, Firestore rechaza la consulta
  // entera y la lista queda vacía sin ningún error visible).
  const availableQuery = useMemoFirebase(() => {
    if (!firestore || !ready) return null; // ARQ-010: ESTA era la consulta que corría para un comprador (pool → permission-denied)
    // Fase YY ter: la regla del pool exige isApprovedDriver() — un pendiente o SUSPENDIDO
    // recibía permission-denied (ruido en consola y Sentry). Sin aprobación no se consulta.
    if (!isApprovedDriver) return null;
    return query(
      collection(firestore, 'orders'),
      where('deliveryPersonId', '==', null),
      where('status', 'in', ['En preparación', 'Listo para recoger'])
    );
  }, [firestore, ready, isApprovedDriver]);
  const { data: allAvailable, isLoading: availableLoading } = useCollection<DriverPoolOrder>(availableQuery);
  // Su propio pedido no aparece en su pool (decisión de producto 18/8: el repartidor puede
  // comprar como cualquier vecino, pero no llevarse su pedido). Misma capa visual que /orders.
  const availableOrders = useMemo(
    () => (allAvailable || []).filter(o => o.userId !== user?.uid),
    [allAvailable, user?.uid],
  );

  // 🚨 PERF-001 (auditoría oct 2026): antes UNA query con todo el historial del
  // repartidor. Ahora dos acotadas: activos en vivo + entregados RECIENTES (creados en
  // los últimos 7 días, índice `orders(deliveryPersonId, status, createdAt)`), y el
  // "hoy" se decide en memoria por `deliveredAt` sobre ese set chico — un pedido tomado
  // ayer y entregado hoy cuenta para hoy (mismo buffer que /delivery/analytics, N9).
  const myActiveQuery = useMemoFirebase(() => {
    if (!firestore || !user || !ready) return null;
    return query(
      collection(firestore, 'orders'),
      where('deliveryPersonId', '==', user.uid),
      where('status', 'in', DRIVER_ACTIVE_STATUSES)
    );
  }, [firestore, user, ready]);
  const { data: activeOrders, isLoading: ordersLoading } = useCollection<any>(myActiveQuery);

  const recentDeliveredQuery = useMemoFirebase(() => {
    if (!firestore || !user || !ready) return null;
    const since = new Date();
    since.setDate(since.getDate() - 7);
    since.setHours(0, 0, 0, 0);
    return query(
      collection(firestore, 'orders'),
      where('deliveryPersonId', '==', user.uid),
      where('status', '==', 'Entregado'),
      where('createdAt', '>=', Timestamp.fromDate(since)),
      orderBy('createdAt', 'desc') // usa el índice (deliveryPersonId, status, createdAt DESC); sin orderBy pediría el ASC
    );
  }, [firestore, user, ready]);
  const { data: recentDelivered } = useCollection<any>(recentDeliveredQuery);

  const stats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todaySec = startOfToday.getTime() / 1000;

    const deliveredToday = (recentDelivered || []).filter(o => {
      const d = o.deliveredAt?.seconds || o.createdAt?.seconds || 0;
      return d >= todaySec;
    });
    // Neto real (Fase PP, N3): mismo cálculo que /delivery/earnings y /delivery/analytics.
    const earningsToday = Math.round(deliveredToday.reduce((sum, o) => sum + driverNetForOrder(o), 0));

    return {
      activeCount: (activeOrders || []).length,
      deliveredTodayCount: deliveredToday.length,
      earningsToday,
    };
  }, [activeOrders, recentDelivered]);

  // Tomar: la MISMA lógica que el panel de entregas (hooks/driver-take-order.ts). Al tomar,
  // la tarjeta sale deslizándose y lleva al repartidor a "En curso".
  const [leaving, setLeaving] = useState<DriverPoolOrder | null>(null);
  const onTaken = useCallback((o: { id: string }) => {
    // El listener puede haber sacado el pedido del pool antes de que vuelva la respuesta:
    // se usa el objeto que se tocó (es el mismo DriverPoolOrder de la tarjeta).
    setLeaving(o as DriverPoolOrder);
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => router.push('/orders?tab=active'), reduce ? 0 : 380);
  }, [router]);
  const take = useDriverTakeOrder({ activeCount: stats.activeCount, onTaken });

  // Un pedido NUEVO mientras mira → suena (no en la carga inicial).
  useDriverPoolSound(allAvailable, availableQuery, user?.uid);

  // La tarjeta que se está yendo sigue en la lista hasta que termina de salir, aunque el
  // listener ya la haya sacado del pool.
  const shown = leaving && !availableOrders.some(o => o.id === leaving.id)
    ? [leaving, ...availableOrders]
    : availableOrders;

  if (authLoading || ordersLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 py-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-44 w-full rounded-card" />
      </div>
    );
  }

  const rating = Number((userProfile as { rating?: number } | null)?.rating) || 0;
  const ratingCount = Number((userProfile as { ratingCount?: number } | null)?.ratingCount) || 0;
  const rawFirst = (userProfile?.displayName || userProfile?.name || '').trim().split(/\s+/)[0] || '';
  const firstName = rawFirst ? rawFirst.charAt(0).toLocaleUpperCase('es-AR') + rawFirst.slice(1) : '';

  return (
    <div className="mx-auto w-full max-w-6xl pb-20">
      <header className="mb-4">
        <h1 className="font-headline text-4xl font-extrabold leading-none tracking-tight">Mi Panel</h1>
        {firstName && <p className="mt-1 text-muted-foreground">Hola, {firstName}. Así viene tu día.</p>}
      </header>

      {isSuspended && <SuspensionNotice className="mb-4" />}
      {!isApprovedDriver && !isSuspended && <DriverPendingNotice className="mb-4" />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-6">
        {/* Columna izquierda: disponibilidad, caja de hoy y accesos */}
        <div className="space-y-4">
          <DeliveryOnlineToggle variant="card" />

          <section className="glass rounded-card p-4 sm:p-5" aria-labelledby="caja-hoy" data-testid="driver-cash">
            <h2 id="caja-hoy" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Caja de hoy</h2>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <Link href="/delivery/earnings" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="font-headline text-[3.25rem] font-extrabold leading-[0.9] tabular-nums text-success" data-testid="driver-earnings-today">
                  {money(stats.earningsToday)}
                </span>
              </Link>
              <span className="text-sm text-muted-foreground">ganaste hoy (neto)</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Link
                href="/delivery/analytics"
                className="flex min-h-[4.5rem] flex-col justify-center rounded-2xl bg-foreground/[0.05] px-3.5 py-2.5 transition-colors hover:bg-foreground/[0.09]"
              >
                <span className="text-sm font-semibold text-muted-foreground">Entregas</span>
                <span className="font-headline text-3xl font-extrabold leading-tight tabular-nums">{stats.deliveredTodayCount}</span>
              </Link>
              <Link
                href="/delivery/reviews"
                className="flex min-h-[4.5rem] flex-col justify-center rounded-2xl bg-foreground/[0.05] px-3.5 py-2.5 transition-colors hover:bg-foreground/[0.09]"
              >
                <span className="text-sm font-semibold text-muted-foreground">Calificación</span>
                <span className="flex items-center gap-1.5 font-headline text-3xl font-extrabold leading-tight tabular-nums">
                  {ratingCount > 0 ? fmtRating(rating) : '—'}
                  <Star className="h-5 w-5 fill-warning text-warning" aria-hidden="true" />
                </span>
              </Link>
            </div>
            {stats.activeCount > 0 && (
              <Link
                href="/orders?tab=active"
                className="mt-2.5 flex min-h-[3rem] items-center gap-3 rounded-2xl bg-primary/10 px-3.5 py-2 font-semibold text-primary transition-colors hover:bg-primary/15"
                data-testid="driver-active-link"
              >
                <Bike className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="flex-1">
                  {stats.activeCount === 1 ? 'Tenés 1 pedido en curso' : `Tenés ${stats.activeCount} pedidos en curso`}
                  <span className="font-normal"> · {stats.activeCount}/{MAX_ACTIVE_ORDERS}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
              </Link>
            )}
          </section>

          <nav aria-label="Accesos" className="glass hidden overflow-hidden rounded-card lg:block">
            <QuickLinks />
          </nav>
        </div>

        {/* Columna derecha: pedidos para tomar */}
        <section aria-labelledby="para-tomar" className="min-w-0">
          <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
            <h2 id="para-tomar" className="font-headline text-2xl font-extrabold">Para tomar</h2>
            {isApprovedDriver && !availableLoading && (
              <span className="text-sm font-semibold tabular-nums text-muted-foreground" data-testid="driver-pool-count">
                {availableOrders.length === 1 ? '1 pedido' : `${availableOrders.length} pedidos`}
              </span>
            )}
          </div>

          {!isApprovedDriver ? (
            <EmptyPool text={isSuspended
              ? 'Mientras dure la suspensión no ves pedidos para tomar.'
              : 'Cuando te aprueben la cuenta, acá vas a ver los pedidos para tomar.'} />
          ) : availableLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-56 w-full rounded-card" />
            </div>
          ) : shown.length === 0 ? (
            <EmptyPool text={isOnline
              ? 'No hay pedidos para tomar ahora. Te avisamos con un sonido cuando entre uno.'
              : 'No hay pedidos para tomar. Estás como no disponible: no te avisamos de los nuevos.'} />
          ) : (
            <div className="space-y-3" data-testid="driver-pool">
              {!isOnline && (
                <p className="px-1 text-sm text-muted-foreground">
                  Estás como no disponible: no te avisamos de pedidos nuevos, pero podés tomar los que ves acá.
                </p>
              )}
              {shown.map((order, i) => (
                <DriverJobCard
                  key={order.id}
                  index={i}
                  order={order}
                  leaving={leaving?.id === order.id}
                  taking={take.takingId === order.id}
                  takeLabel={leaving?.id === order.id ? 'Tomado' : take.takeLabel(order.id)}
                  takeDisabled={take.takeDisabled || !!leaving}
                  onTake={() => take.takeOrder(order)}
                  onDetail={() => router.push(`/orders/${order.id}`)}
                />
              ))}
            </div>
          )}

          {/* En celular los accesos van al final, después de lo urgente. */}
          <nav aria-label="Accesos" className="glass mt-6 overflow-hidden rounded-card lg:hidden">
            <QuickLinks />
          </nav>
        </section>
      </div>
    </div>
  );
}

function EmptyPool({ text }: { text: string }) {
  return (
    <div className="glass flex items-center gap-3 rounded-card p-5" data-testid="driver-pool-empty">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-foreground/[0.06] text-muted-foreground">
        <PackageSearch className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
}

const LINKS = [
  { href: '/delivery/earnings', icon: Wallet, label: 'Ganancias', hint: 'Saldo y retiros' },
  { href: '/delivery/analytics', icon: BarChart3, label: 'Analíticas', hint: 'Por día y horas pico' },
  { href: '/delivery/reviews', icon: Star, label: 'Reseñas', hint: 'Lo que dicen de vos' },
  { href: '/orders', icon: Truck, label: 'Pedidos', hint: 'Disponibles y en curso' },
] as const;

function QuickLinks() {
  return (
    <ul>
      {LINKS.map(({ href, icon: Icon, label, hint }, i) => (
        <li key={href} className={cn(i > 0 && 'border-t border-foreground/10')}>
          <Link href={href} className="flex min-h-[3.75rem] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05] focus-visible:outline-none">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{label}</span>
              <span className="block text-sm text-muted-foreground">{hint}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
