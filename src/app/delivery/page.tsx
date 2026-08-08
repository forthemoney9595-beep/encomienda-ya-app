'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where } from 'firebase/firestore';
import { driverNetForOrder } from '@/lib/money';
import PageHeader from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DeliveryOnlineToggle } from '@/components/delivery-online-toggle';
import {
  Truck, Wallet, Star, BarChart3, PackageCheck, ShoppingBag, Clock, ArrowRight,
} from 'lucide-react';

export default function DeliveryDashboardPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'delivery')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  const isApprovedDriver = (userProfile as any)?.isApproved === true;

  // Mismas 2 queries que delivery-orders-view.tsx (panel operativo) -- ver por qué el
  // rango de estados tiene que coincidir exacto con firestore.rules en ese archivo.
  const availableQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'orders'),
      where('deliveryPersonId', '==', null),
      where('status', 'in', ['En preparación', 'Listo para recoger'])
    );
  }, [firestore]);
  const { data: availableOrders } = useCollection<any>(availableQuery);

  const myOrdersQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'orders'), where('deliveryPersonId', '==', user.uid));
  }, [firestore, user]);
  const { data: myOrders, isLoading: ordersLoading } = useCollection<any>(myOrdersQuery);

  const stats = useMemo(() => {
    const all = myOrders || [];
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todaySec = startOfToday.getTime() / 1000;

    const active = all.filter(o => ['En camino', 'En reparto', 'En preparación', 'Listo para recoger'].includes(o.status));
    // "Hoy" según cuándo se entregó (no cuándo se creó el pedido) -- un pedido tomado
    // ayer pero entregado hoy cuenta para las ganancias de hoy.
    const deliveredToday = all.filter(o => {
      if (o.status !== 'Entregado') return false;
      const d = o.deliveredAt?.seconds || o.createdAt?.seconds || 0;
      return d >= todaySec;
    });
    // Neto real (Fase PP, N3): antes era `deliveryFee` crudo y contradecía a
    // /delivery/earnings y /delivery/analytics, que ya usan driverNetForOrder.
    const earningsToday = Math.round(deliveredToday.reduce((sum, o) => sum + driverNetForOrder(o), 0));

    return {
      availableCount: availableOrders?.length || 0,
      activeCount: active.length,
      deliveredTodayCount: deliveredToday.length,
      earningsToday,
    };
  }, [myOrders, availableOrders]);

  if (authLoading || ordersLoading) {
    return (
      <div className="container mx-auto space-y-4 py-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      </div>
    );
  }

  const rating = (userProfile as any)?.rating || 0;
  const ratingCount = (userProfile as any)?.ratingCount || 0;

  return (
    <div className="container mx-auto space-y-6 pb-20">
      <PageHeader title="Mi Panel" description="Resumen de tu actividad como repartidor.">
        <DeliveryOnlineToggle />
      </PageHeader>

      {!isApprovedDriver && (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="flex items-start gap-3 py-5">
            <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-warning">Tu cuenta está pendiente de aprobación</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Un administrador tiene que revisar tus datos antes de que puedas tomar pedidos.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Disponibles ahora" value={stats.availableCount} icon={PackageCheck} tone="info" href="/orders" />
        <StatCard label="En curso" value={stats.activeCount} icon={ShoppingBag} tone="warning" href="/orders?tab=active" />
        <StatCard label="Entregados hoy" value={stats.deliveredTodayCount} icon={Truck} tone="muted" href="/orders?tab=active" />
        <StatCard label="Ganancias de hoy" value={`$${stats.earningsToday.toLocaleString()}`} icon={Wallet} tone="success" href="/delivery/earnings" />
      </div>

      {/* Rating */}
      <Card>
        <CardContent className="flex items-center gap-4 py-5">
          <div className="text-3xl font-bold text-warning">{rating.toFixed(1)}</div>
          <div>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={`h-4 w-4 ${Math.round(rating) >= s ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`} />
              ))}
            </div>
            <Link href="/delivery/reviews" className="text-sm text-muted-foreground hover:underline">
              {ratingCount} reseña{ratingCount === 1 ? '' : 's'} — ver todas
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Accesos rápidos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickLink href="/orders" icon={Truck} label="Panel de Entregas" />
          <QuickLink href="/delivery/earnings" icon={Wallet} label="Mis Ganancias" />
          <QuickLink href="/delivery/reviews" icon={Star} label="Mis Reseñas" />
          <QuickLink href="/delivery/analytics" icon={BarChart3} label="Analíticas" />
        </div>
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  info: 'text-info',
  warning: 'text-warning',
  success: 'text-success',
  muted: 'text-foreground',
};

function StatCard({ label, value, icon: Icon, tone, href }: { label: string; value: string | number; icon: any; tone: string; href: string }) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow h-full">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <Icon className={`h-4 w-4 ${TONES[tone]}`} />
          </div>
          <div className={`text-2xl font-bold ${TONES[tone]}`}>{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md hover:border-primary/40 transition-all">
        <CardContent className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <Icon className="h-6 w-6 text-primary" />
          <span className="text-sm font-medium">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
