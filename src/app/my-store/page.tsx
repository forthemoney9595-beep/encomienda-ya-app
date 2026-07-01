'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { useDoc, useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { doc, collection, query, where, updateDoc } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Package, Tag, ListOrdered, Star, Wallet, BarChart3,
  AlertTriangle, PauseCircle, ShoppingBag, Pencil, ArrowRight, ExternalLink, Bell
} from 'lucide-react';
import { normalizeSchedule, getStoreOpenStatus, describeSchedule } from '@/lib/store-hours';

const PRODUCT_STATES = ['Pendiente de Pago', 'En preparación', 'En reparto', 'En camino'];

export default function StoreDashboardPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const storeId = userProfile?.storeId;

  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'store')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  // --- Tienda ---
  const storeRef = useMemoFirebase(
    () => (firestore && storeId ? doc(firestore, 'stores', storeId) : null),
    [firestore, storeId]
  );
  const { data: store, isLoading: storeLoading } = useDoc<any>(storeRef);

  // --- Pedidos ---
  const ordersQuery = useMemoFirebase(
    () => (firestore && storeId ? query(collection(firestore, 'orders'), where('storeId', '==', storeId)) : null),
    [firestore, storeId]
  );
  const { data: orders } = useCollection<any>(ordersQuery);

  // --- Productos (items + legacy 'products') para el aviso de stock bajo ---
  const itemsQuery = useMemoFirebase(
    () => (firestore && storeId ? query(collection(firestore, 'stores', storeId, 'items')) : null),
    [firestore, storeId]
  );
  const { data: items } = useCollection<any>(itemsQuery);
  const legacyQuery = useMemoFirebase(
    () => (firestore && storeId ? query(collection(firestore, 'stores', storeId, 'products')) : null),
    [firestore, storeId]
  );
  const { data: legacyItems } = useCollection<any>(legacyQuery);

  const stats = useMemo(() => {
    const all = orders || [];
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todaySec = startOfToday.getTime() / 1000;

    const pending = all.filter(o => o.status === 'Pendiente de Confirmación');
    const active = all.filter(o => PRODUCT_STATES.includes(o.status));
    const deliveredToday = all.filter(o => o.status === 'Entregado' && (o.createdAt?.seconds || 0) >= todaySec);
    const salesToday = deliveredToday.reduce((sum, o) => sum + Math.max(0, (o.total || 0) - (o.deliveryFee || 0)), 0);

    return {
      pendingCount: pending.length,
      activeCount: active.length,
      deliveredTodayCount: deliveredToday.length,
      salesToday,
    };
  }, [orders]);

  const lowStock = useMemo(() => {
    const all = [...(items || []), ...(legacyItems || [])];
    return all.filter(p => p.stock != null && p.stock <= 3);
  }, [items, legacyItems]);

  const handleTogglePause = async (checked: boolean) => {
    if (!firestore || !storeId) return;
    try {
      await updateDoc(doc(firestore, 'stores', storeId), { manuallyPaused: checked });
      toast({
        title: checked ? 'Tienda pausada' : 'Tienda reactivada',
        description: checked
          ? 'No vas a recibir pedidos nuevos hasta que la reactives.'
          : 'Ya podés volver a recibir pedidos.',
      });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cambiar el estado de la tienda.' });
    }
  };

  if (authLoading || storeLoading) {
    return (
      <div className="container mx-auto space-y-4 py-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      </div>
    );
  }

  const paused = !!store?.manuallyPaused;
  const openStatus = getStoreOpenStatus(normalizeSchedule(store));

  return (
    <div className="container mx-auto space-y-6 pb-20">
      <PageHeader
        title={store?.name || 'Mi Tienda'}
        description="Resumen de tu negocio y accesos rápidos."
      >
        <div className="flex gap-2">
          <Link href="/my-store/edit">
            <Button variant="outline"><Pencil className="mr-2 h-4 w-4" /> Editar Tienda</Button>
          </Link>
          {storeId && (
            <Link href={`/stores/${storeId}`} target="_blank">
              <Button variant="ghost"><ExternalLink className="mr-2 h-4 w-4" /> Ver</Button>
            </Link>
          )}
        </div>
      </PageHeader>

      {/* Estado de la tienda + pausa rápida */}
      <Card className={paused ? 'border-destructive/40 bg-destructive/5' : ''}>
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div className="flex items-center gap-3">
            <PauseCircle className={`h-6 w-6 ${paused ? 'text-destructive' : 'text-muted-foreground'}`} />
            <div>
              <p className="font-semibold flex items-center gap-2">
                Estado de la tienda
                <Badge className={paused ? 'bg-destructive/15 text-destructive border-destructive/30' : 'bg-success/15 text-success border-success/30'}>
                  {paused ? 'Pausada' : 'Activa'}
                </Badge>
              </p>
              <p className="text-sm text-muted-foreground">
                {paused
                  ? 'No te llegan pedidos nuevos aunque estés en horario.'
                  : `${openStatus.isOpen ? 'Abierta ahora' : 'Cerrada ahora'} · ${describeSchedule(store)}`}
              </p>
            </div>
          </div>
          <Switch checked={paused} onCheckedChange={handleTogglePause} />
        </CardContent>
      </Card>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pedidos nuevos"
          value={stats.pendingCount}
          icon={Bell}
          tone={stats.pendingCount > 0 ? 'warning' : 'muted'}
          href="/orders"
        />
        <StatCard label="En curso" value={stats.activeCount} icon={ShoppingBag} tone="info" href="/orders" />
        <StatCard label="Entregados hoy" value={stats.deliveredTodayCount} icon={ListOrdered} tone="muted" href="/orders" />
        <StatCard
          label="Ventas de hoy"
          value={`$${stats.salesToday.toLocaleString()}`}
          icon={Wallet}
          tone="success"
          href="/my-store/wallet"
        />
      </div>

      {/* Alertas / acciones pendientes */}
      {(stats.pendingCount > 0 || lowStock.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {stats.pendingCount > 0 && (
            <Card className="border-l-4 border-l-warning">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4 text-warning" /> {stats.pendingCount} pedido(s) esperando confirmación
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Link href="/orders">
                  <Button size="sm" className="bg-warning hover:bg-warning/90 text-warning-foreground">
                    Revisar ahora <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
          {lowStock.length > 0 && (
            <Card className="border-l-4 border-l-destructive">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" /> {lowStock.length} producto(s) con stock bajo
                </CardTitle>
                <CardDescription className="line-clamp-1">
                  {lowStock.slice(0, 4).map(p => `${p.name || 'Sin nombre'} (${p.stock})`).join(' · ')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/my-store/products">
                  <Button size="sm" variant="outline">Gestionar stock <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Rating rápido */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="text-3xl font-bold text-warning">{(store?.rating || 0).toFixed(1)}</div>
            <div>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`h-4 w-4 ${Math.round(store?.rating || 0) >= s ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`} />
                ))}
              </div>
              <Link href="/my-store/reviews" className="text-sm text-muted-foreground hover:underline">
                {store?.ratingCount || 0} reseña{store?.ratingCount === 1 ? '' : 's'} — ver todas
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Accesos rápidos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <QuickLink href="/orders" icon={ListOrdered} label="Pedidos" />
          <QuickLink href="/my-store/products" icon={Package} label="Productos" />
          <QuickLink href="/my-store/categories" icon={Tag} label="Categorías" />
          <QuickLink href="/my-store/reviews" icon={Star} label="Reseñas" />
          <QuickLink href="/my-store/wallet" icon={Wallet} label="Billetera" />
          <QuickLink href="/my-store/analytics" icon={BarChart3} label="Analíticas" />
        </div>
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  warning: 'text-warning',
  info: 'text-info',
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
