'use client';

import { useMemo, useRef, useState } from 'react';
import { money } from '@/lib/format-money';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
// ✅ AGREGADO: Importamos 'ChefHat' para darle un ícono bonito al estado "En preparación"
import { Package, Clock, Truck, CheckCircle2, ChevronRight, DollarSign, ChefHat, AlertCircle, Search } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getOrderStatusKind, orderStatusBadgeClass, orderStatusTextClass, type OrderStatusKind } from '@/lib/order-status';
import { SlidingPill, GlassBone } from '@/components/buyer-motion';

// Cuadradito suave del ícono de estado (vidrio 9/11/2026): reemplaza al borde izquierdo de
// color, que sobre una tarjeta de vidrio redondeada se veía como un corte. Clases literales.
const STATUS_TILE: Record<OrderStatusKind, string> = {
  success: 'bg-success/15',
  info: 'bg-info/15',
  warning: 'bg-warning/15',
  destructive: 'bg-destructive/15',
  neutral: 'bg-foreground/[0.07]',
};

// Agrupa los ~10 estados reales del pedido en 3 baldes simples para filtrar -- reusa el
// mismo mapeo semántico de order-status.ts en vez de inventar uno nuevo.
type StatusBucket = 'active' | 'delivered' | 'cancelled';
const bucketOf = (status: string): StatusBucket => {
  const kind = getOrderStatusKind(status);
  if (kind === 'success') return 'delivered';
  if (kind === 'destructive') return 'cancelled';
  return 'active'; // info (en camino/reparto), warning (preparación/listo), neutral (pendiente)
};

const STATUS_TABS: { value: 'all' | StatusBucket; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'En curso' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'cancelled', label: 'Cancelados' },
];

// showHeader=false: /my-purchases ya pone su propio título ("Mis Compras").
export default function BuyerOrdersView({ showHeader = true }: { showHeader?: boolean } = {}) {
  const { user } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<'all' | StatusBucket>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const tabsRef = useRef<HTMLDivElement>(null);

  const ordersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, user?.uid]);

  // useCollection ya escucha cambios en tiempo real (onSnapshot). Los pedidos de UN
  // comprador son un conjunto naturalmente acotado (a diferencia de las colecciones sin
  // techo de la Fase Y/Z), así que filtrar/buscar en memoria acá no viola esa regla.
  const { data: orders, isLoading } = useCollection<any>(ordersQuery);

  const counts = useMemo(() => {
    const c: Record<'all' | StatusBucket, number> = { all: orders?.length || 0, active: 0, delivered: 0, cancelled: 0 };
    orders?.forEach(o => { c[bucketOf(o.status)]++; });
    return c;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (orders || []).filter(o => {
      if (statusFilter !== 'all' && bucketOf(o.status) !== statusFilter) return false;
      if (term && !(o.storeName || '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [orders, statusFilter, searchTerm]);

  // Carga en vidrio: la misma silueta que las tarjetas (antes, un texto suelto).
  if (isLoading) return (
    <div className="container mx-auto space-y-3 py-6" aria-busy="true" aria-label="Cargando tus pedidos">
      <GlassBone className="mb-4 h-9 w-48" />
      {[1, 2, 3].map(i => (
        <Card key={i} className="flex items-center gap-4 p-4">
          <GlassBone className="h-12 w-12 rounded-2xl" />
          <div className="flex-1 space-y-2"><GlassBone className="h-5 w-1/2" /><GlassBone className="h-4 w-1/3" /></div>
          <GlassBone className="h-6 w-16" />
        </Card>
      ))}
    </div>
  );

  // 🎨 Ícono por estado, coloreado con el sistema semántico compartido.
  const getStatusIcon = (status: string) => {
    const s = status?.toLowerCase() || '';
    const color = orderStatusTextClass[getOrderStatusKind(status)];

    if (s.includes('entregado')) return <CheckCircle2 className={cn('h-5 w-5', color)} />;
    if (s.includes('reparto') || s.includes('camino')) return <Truck className={cn('h-5 w-5', color)} />;
    if (s.includes('preparación') || s.includes('cocina') || s.includes('listo')) return <ChefHat className={cn('h-5 w-5', color)} />;
    if (s.includes('cancelado') || s.includes('rechazado')) return <AlertCircle className={cn('h-5 w-5', color)} />;
    return <Clock className={cn('h-5 w-5', color)} />;
  };

  const formatDate = (date: any) => {
    if (!date) return 'Fecha desconocida';
    try {
        let dateObj: Date;
        if (typeof date === 'object' && typeof date.toDate === 'function') {
             dateObj = date.toDate();
        } else if (date instanceof Date) {
            dateObj = date;
        } else {
            return '';
        }
        return format(dateObj, "d MMM, HH:mm", { locale: es });
    } catch (error) {
        return '';
    }
  };

  return (
    <div className="container mx-auto">
      {showHeader && <PageHeader title="Mis Pedidos" description="Seguí el estado de tus compras en tiempo real." />}

      {orders && orders.length > 0 && (
        <div className="mb-6 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-4 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Buscar por tienda"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por tienda..."
              className="h-12 rounded-full border-[color:var(--glass-line)] bg-[color:var(--glass-strong)] pl-11 shadow-[var(--glass-shadow)] [backdrop-filter:blur(var(--glass-blur))_saturate(1.5)]"
            />
          </div>
          {/* Solapas en vidrio con la píldora de la marca que se desliza (antes saltaba). Con
              scroll horizontal en vez de partirse en dos renglones a 430 px. */}
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | StatusBucket)}>
            <div className="min-w-0">
              <TabsList ref={tabsRef} className="glass relative h-auto max-w-full justify-start gap-1 overflow-x-auto rounded-full p-1 no-scrollbar">
                <SlidingPill containerRef={tabsRef} activeSelector='[data-state="active"]' activeKey={statusFilter + JSON.stringify(counts)} className="rounded-full bg-primary shadow-sm" />
                {STATUS_TABS.map(t => (
                  <TabsTrigger key={t.value} value={t.value} className="relative z-[1] min-h-[40px] shrink-0 rounded-full px-4 text-sm font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-primary-foreground data-[state=active]:shadow-none">
                    {t.label} ({counts[t.value]})
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        </div>
      )}

      <div className="space-y-3">
        {!orders || orders.length === 0 ? (
            <Card className="px-5 py-12 text-center">
                <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-card bg-primary/10"><Package className="h-8 w-8 text-primary" aria-hidden="true" /></span>
                <h3 className="font-headline text-2xl font-extrabold">Todavía no hiciste pedidos</h3>
                <Button onClick={() => router.push('/')} className="mt-4 h-11 rounded-full px-6">Ir a comprar</Button>
            </Card>
        ) : filteredOrders.length === 0 ? (
            <Card className="px-5 py-12 text-center">
                <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
                <h3 className="text-lg font-medium text-muted-foreground">Sin resultados con ese filtro</h3>
            </Card>
        ) : (
            filteredOrders.map((order, i) => {
                const displayTotal = order.total || 0;
                // Detectamos si fue pagado por MP
                const isPaid = order.paymentStatus === 'paid';
                // Borde por ESTADO del pedido, no por pago (Fase QQ): un pedido
                // cancelado que estuvo pagado quedaba con borde verde de "todo bien".
                const cardKind = getOrderStatusKind(order.status);

                return (
                    <Card
                        key={order.id}
                        data-testid="buyer-order-card"
                        role="link"
                        tabIndex={0}
                        aria-label={`Pedido a ${order.storeName}, ${order.status}`}
                        className="stagger-in group cursor-pointer outline-none transition-transform duration-150 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100"
                        style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                        onClick={() => router.push(`/orders/${order.id}`)}
                        onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/orders/${order.id}`); }}
                    >
                        <div className="flex items-center justify-between gap-3 p-4">
                            <div className="flex min-w-0 items-start gap-4">
                                <div className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', STATUS_TILE[cardKind])}>
                                    {getStatusIcon(order.status)}
                                </div>
                                <div className="min-w-0">
                                    <h4 className="truncate font-headline text-xl font-extrabold leading-tight">{order.storeName}</h4>
                                    <p className="text-sm text-muted-foreground">
                                        {formatDate(order.createdAt)}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {/* Badge de Estado del Pedido */}
                                        <Badge variant="outline" className={cn('rounded-full text-xs', orderStatusBadgeClass[getOrderStatusKind(order.status)])}>
                                            {order.status}
                                        </Badge>

                                        {/* Badge de Método de Pago */}
                                        <Badge variant="outline" className={`rounded-full text-xs flex items-center gap-1 ${isPaid ? 'bg-success/15 text-success border-success/30' : ''}`}>
                                            {order.paymentMethod === 'mercadopago' ? 'MercadoPago' : order.paymentMethod}
                                            {isPaid && <CheckCircle2 className="h-3 w-3 ml-1" />}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                            <div className="shrink-0 text-right">
                                <p className="font-headline text-xl font-extrabold tabular-nums">{money(displayTotal)}</p>
                                <ChevronRight className="ml-auto mt-2 h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
                            </div>
                        </div>
                    </Card>
                );
            })
        )}
      </div>
    </div>
  );
}