'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminAuthGuard from '../../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useDoc, useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { logAdminAction } from '@/lib/admin-audit';
import { getOrderStatusKind, orderStatusBadgeClass } from '@/lib/order-status';
import { storeBaseAmount, commissionForOrder, storeNetForOrder, FALLBACK_COMMISSION } from '@/lib/money';
import { AccountStatement, type StatementMovement } from '@/components/account-statement';
import { setAccountApproval } from '@/lib/approval-service';
import { CLAIM_TYPES, type Claim, type ClaimType } from '@/lib/claim-types';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Store, MapPin, Star, ShoppingBag, TrendingUp, XCircle,
    Pause, Play, Check, AlertTriangle, Wallet, ExternalLink, Save, Loader2,
    MessageSquareWarning
} from 'lucide-react';
import Link from 'next/link';
import type { Order } from '@/lib/order-service';

const formatDate = (ts: any) => {
    if (!ts) return '—';
    try { return format(ts.toDate ? ts.toDate() : new Date(ts), 'd MMM HH:mm', { locale: es }); } catch { return '—'; }
};

function AdminStoreDetailPage({ params }: { params: { storeId: string } }) {
    const { storeId } = params;
    const firestore = useFirestore();
    const { user: adminUser } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [savingCbu, setSavingCbu]       = useState(false);
    const [cbuInput, setCbuInput]         = useState('');
    const [cbuLoaded, setCbuLoaded]       = useState(false);
    const [togglingPause, setTogglingPause] = useState(false);

    // Datos de la tienda
    const storeRef = useMemoFirebase(() => firestore ? doc(firestore, 'stores', storeId) : null, [firestore, storeId]);
    const { data: store, isLoading: storeLoading } = useDoc<any>(storeRef);

    // Pre-cargar CBU cuando lleguen los datos de la tienda
    if (store && !cbuLoaded) {
        setCbuInput(store.payoutCbu || '');
        setCbuLoaded(true);
    }

    // Pedidos de esta tienda. Fase OO: subió de 50 a 200 para que el estado de cuenta
    // cubra más historia con la MISMA query (la tabla de abajo sigue mostrando 50).
    const ORDERS_CAP = 200;
    const ordersQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'orders'),
            where('storeId', '==', storeId),
            orderBy('createdAt', 'desc'),
            limit(ORDERS_CAP)
        );
    }, [firestore, storeId]);
    const { data: orders, isLoading: ordersLoading } = useCollection<Order>(ordersQuery);

    // Reseñas de la tienda
    const reviewsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'reviews'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'), limit(10));
    }, [firestore, storeId]);
    const { data: reviews, isLoading: reviewsLoading } = useCollection<any>(reviewsQuery);

    // Retiros de esta tienda (Fase OO — la ficha de repartidor ya los tenía, la de tienda
    // no; sin ellos no hay estado de cuenta posible). userRole acotado igual que el cron.
    const withdrawalsQuery = useMemoFirebase(() => {
        if (!firestore || !store?.ownerId) return null;
        return query(
            collection(firestore, 'withdrawals'),
            where('userId', '==', store.ownerId),
            where('userRole', '==', 'store'),
        );
    }, [firestore, store?.ownerId]);
    const { data: withdrawals } = useCollection<any>(withdrawalsQuery);

    // Reclamos sobre pedidos de esta tienda (Fase OO): una tienda que acumula reclamos es
    // un problema de calidad que antes solo se veía revisando /admin/claims a mano.
    const claimsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'claims'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'), limit(20));
    }, [firestore, storeId]);
    const { data: storeClaims } = useCollection<Claim>(claimsQuery);

    // Métricas.
    // ⚠️ Se calculan sobre los ÚLTIMOS 50 pedidos (ver `limit(50)` arriba), no sobre el
    // histórico completo. La UI lo aclara en cada tarjeta: antes no lo decía en ningún lado
    // y con 300 pedidos mostraba ~1/6 de las ventas reales como si fuera el total.
    const metrics = useMemo(() => {
        if (!orders) return { revenue: 0, delivered: 0, cancelled: 0, commission: 0, avgTicket: 0 };
        // Comisión: la de la tienda, o la global. Antes `|| 0` mostraba $0 de comisión
        // para las tiendas sin tarifa propia, aunque el servidor sí se la cobra.
        const storeRate = store?.commissionRate;
        const fallbackRate = (typeof storeRate === 'number' && storeRate > 0) ? storeRate : FALLBACK_COMMISSION;
        const delivered  = orders.filter(o => o.status === 'Entregado');
        const cancelled  = orders.filter(o => o.status === 'Cancelado' || o.status === 'Rechazado');
        const revenue    = delivered.reduce((s, o) => s + (o.total || 0), 0);
        // Misma base que el reparto real (src/lib/money.ts): productos, sin la tarifa de
        // servicio, y con la comisión congelada del pedido si la tiene.
        const commission = delivered.reduce(
            (s, o) => s + storeBaseAmount(o as any) * commissionForOrder(o as any, fallbackRate) / 100, 0);
        return {
            revenue,
            delivered: delivered.length,
            cancelled: cancelled.length,
            commission,
            avgTicket: delivered.length > 0 ? revenue / delivered.length : 0,
        };
    }, [orders, store]);

    // Estado de cuenta (Fase OO): pedidos netos con la MISMA fórmula que aprueba retiros
    // (money.ts) + retiros. El reembolso no es una fila aparte a propósito: ya está
    // descontado dentro del neto del pedido (refundRatio) — una fila separada lo
    // descontaría dos veces; se muestra como detalle de la fila del pedido.
    const statement = useMemo(() => {
        const storeRate = store?.commissionRate;
        const fallbackRate = (typeof storeRate === 'number' && storeRate > 0) ? storeRate : FALLBACK_COMMISSION;
        const movements: StatementMovement[] = [];
        let earned = 0, paid = 0, requested = 0;

        for (const o of orders || []) {
            if (o.status !== 'Entregado') continue;
            const net = storeNetForOrder(o as any, fallbackRate);
            earned += net;
            movements.push({
                id: `o-${o.id}`,
                date: (o as any).deliveredAt || o.createdAt,
                label: `Pedido entregado — ${o.customerName || 'Cliente'}`,
                detail: `venta $${(o.total || 0).toLocaleString('es-AR')} · comisión ${commissionForOrder(o as any, fallbackRate)}%` +
                    (o.refunded ? ` · reembolso −$${Math.round(o.refundAmount || 0).toLocaleString('es-AR')} aplicado` : ''),
                amount: net,
                tone: 'in',
                href: `/orders/${o.id}`,
            });
        }
        for (const w of withdrawals || []) {
            const amount = Number(w.amount) || 0;
            if (w.status === 'approved') {
                paid += amount;
                movements.push({
                    id: `w-${w.id}`,
                    date: w.processedAt || w.createdAt,
                    label: w.source === 'auto' ? 'Liquidación pagada' : 'Retiro pagado',
                    detail: w.operationRef ? `op ${w.operationRef}` : 'sin comprobante (anterior a que fuera obligatorio)',
                    amount: -amount,
                    tone: 'out',
                });
            } else if (w.status === 'pending') {
                requested += amount;
                movements.push({
                    id: `w-${w.id}`, date: w.createdAt,
                    label: w.source === 'auto' ? 'Liquidación generada' : 'Retiro solicitado',
                    amount: -amount, tone: 'muted', badge: 'pendiente',
                });
            } else {
                movements.push({
                    id: `w-${w.id}`, date: w.createdAt,
                    label: 'Retiro rechazado',
                    detail: w.rejectionReason || undefined,
                    amount: -amount, tone: 'muted', badge: 'rechazado',
                });
            }
        }
        return {
            movements,
            summary: {
                earned, paid, requested,
                balance: Math.max(0, earned - paid - requested),
                debt: Math.max(0, paid - earned),
            },
        };
    }, [orders, withdrawals, store]);

    // Acciones
    const handleSaveCbu = async () => {
        if (!firestore || !storeRef) return;
        setSavingCbu(true);
        try {
            await updateDoc(storeRef, { payoutCbu: cbuInput.trim() });
            // El CBU define a qué cuenta se transfiere la plata en la liquidación -- cambiarlo
            // tiene que quedar registrado sí o sí (antes no quedaba en ningún lado).
            if (adminUser) logAdminAction(firestore, adminUser.uid, 'edit_cbu', storeId, `tienda — CBU ...${cbuInput.trim().slice(-4)}`);
            toast({ title: 'CBU guardado', description: 'La próxima liquidación automática usará este CBU.' });
        } catch {
            toast({ variant: 'destructive', title: 'Error al guardar' });
        } finally {
            setSavingCbu(false);
        }
    };

    const handleTogglePause = async () => {
        if (!firestore || !storeRef || !store) return;
        setTogglingPause(true);
        try {
            await updateDoc(storeRef, { manuallyPaused: !store.manuallyPaused });
            if (adminUser) logAdminAction(firestore, adminUser.uid, store.manuallyPaused ? 'unpause_store' : 'pause_store', storeId, store.name || '');
            toast({ title: store.manuallyPaused ? 'Tienda reactivada' : 'Tienda pausada' });
        } catch {
            toast({ variant: 'destructive', title: 'Error al cambiar estado' });
        } finally {
            setTogglingPause(false);
        }
    };

    const handleToggleApproval = async () => {
        if (!firestore || !store) return;
        try {
            // Servicio único (Fase PP): antes este camino tocaba SOLO stores.isApproved y
            // el dueño quedaba para siempre en la cola de solicitudes del dashboard (que
            // filtra por users.isApproved).
            if (store.ownerId) {
                await setAccountApproval(firestore, {
                    userId: store.ownerId,
                    approved: !store.isApproved,
                    role: 'store',
                    storeId,
                    adminUser,
                    label: `tienda: ${store.name || ''}`,
                });
            } else if (storeRef) {
                // Tienda sin dueño (caso anómalo): al menos publicarla/despublicarla.
                await updateDoc(storeRef, { isApproved: !store.isApproved });
                if (adminUser) logAdminAction(firestore, adminUser.uid, store.isApproved ? 'reject_account' : 'approve_account', storeId, `tienda sin dueño: ${store.name || ''}`);
            }
            toast({ title: store.isApproved ? 'Aprobación retirada' : 'Tienda aprobada y dueño notificado' });
        } catch {
            toast({ variant: 'destructive', title: 'Error' });
        }
    };

    if (storeLoading) {
        return (
            <div className="container mx-auto pb-20 space-y-4">
                <Skeleton className="h-10 w-64" />
                <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
            </div>
        );
    }

    if (!store) {
        return (
            <div className="container mx-auto pb-20 text-center py-20 text-muted-foreground">
                Tienda no encontrada. <Button variant="link" onClick={() => router.back()}>Volver</Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto pb-20 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16 rounded-xl border">
                    <AvatarImage src={store.imageUrl || store.bannerImageUrl} />
                    <AvatarFallback><Store className="h-7 w-7" /></AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-2xl font-bold">{store.name}</h1>
                        <Badge variant={store.isApproved ? 'default' : 'destructive'} className="text-[10px]">
                            {store.isApproved ? 'Aprobada' : 'No aprobada'}
                        </Badge>
                        {store.manuallyPaused && (
                            <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">Pausada</Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="h-3.5 w-3.5" /> {store.address}
                    </p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Comisión: <strong>{store.commissionRate || 0}%</strong></span>
                        {store.rating > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Star className="h-3 w-3 fill-warning text-warning" />
                                {Number(store.rating).toFixed(1)} ({store.ratingCount || 0} reseñas)
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={handleTogglePause} disabled={togglingPause} className="gap-1.5">
                        {togglingPause ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : store.manuallyPaused ? <Play className="h-3.5 w-3.5 text-success" /> : <Pause className="h-3.5 w-3.5 text-warning" />}
                        {store.manuallyPaused ? 'Reactivar' : 'Pausar'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleToggleApproval} className="gap-1.5">
                        {store.isApproved
                            ? <><XCircle className="h-3.5 w-3.5 text-destructive" /> Revocar</>
                            : <><Check className="h-3.5 w-3.5 text-success" /> Aprobar</>}
                    </Button>
                </div>
            </div>

            {/* Métricas — SOBRE LOS ÚLTIMOS 50 PEDIDOS, no el histórico. Antes las tarjetas
                no lo decían y se leían como totales de la tienda. */}
            <div>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-5">
                    {[
                        { label: 'Ventas brutas', value: `$${Math.round(metrics.revenue).toLocaleString('es-AR')}`, icon: TrendingUp, color: 'text-success' },
                        { label: 'Entregados',    value: metrics.delivered,  icon: ShoppingBag,   color: 'text-info' },
                        { label: 'Cancelados',    value: metrics.cancelled,  icon: XCircle,       color: 'text-destructive' },
                        { label: 'Comisión plat.', value: `$${Math.round(metrics.commission).toLocaleString('es-AR')}`, icon: Wallet, color: 'text-primary' },
                        { label: 'Ticket prom.',  value: `$${Math.round(metrics.avgTicket).toLocaleString('es-AR')}`, icon: Star, color: 'text-warning' },
                    ].map(({ label, value, icon: Icon, color }) => (
                        <Card key={label} className="shadow-sm">
                            <CardContent className="pt-3 pb-3">
                                <Icon className={cn('h-4 w-4 mb-1', color)} />
                                <div className={cn('text-xl font-bold', color)}>{value}</div>
                                <div className="text-[11px] text-muted-foreground">{label}</div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                    Calculado sobre los últimos {orders?.length ?? 0} pedidos cargados, no sobre todo el
                    histórico. El saldo real a pagar está en Finanzas.
                </p>
            </div>

            {/* Estado de cuenta (Fase OO): la historia completa de la plata de esta cuenta */}
            <AccountStatement
                movements={statement.movements}
                summary={statement.summary}
                capReached={(orders?.length ?? 0) >= ORDERS_CAP}
                csvName={`estado-cuenta-${(store.name || storeId).toString().replace(/\s+/g, '-').toLowerCase()}.csv`}
            />

            {/* Reclamos de clientes sobre pedidos de esta tienda */}
            {storeClaims && storeClaims.length > 0 && (
                <Card className="shadow-sm border-l-4 border-l-warning">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <MessageSquareWarning className="h-4 w-4 text-warning" /> Reclamos de clientes
                            <span className="text-xs font-normal text-muted-foreground">({storeClaims.length} recientes)</span>
                        </CardTitle>
                        <CardDescription>
                            Reclamos sobre pedidos de esta tienda — muchos reclamos acá es un problema de calidad del comercio.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {storeClaims.map(c => (
                            <div key={c.id} className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2">
                                <Badge variant="outline" className={cn('text-[10px] shrink-0',
                                    c.resolved
                                        ? (c.resolution === 'rejected' ? 'text-muted-foreground' : 'border-success/40 text-success')
                                        : 'border-warning/40 text-warning')}>
                                    {c.resolved ? (c.resolution === 'rejected' ? 'Rechazado' : 'Resuelto') : 'Pendiente'}
                                </Badge>
                                <span className="truncate">{CLAIM_TYPES[c.type as ClaimType]?.label || c.type}</span>
                                <span className="text-xs text-muted-foreground truncate">· {c.userName}</span>
                                <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">{formatDate(c.createdAt)}</span>
                                <Link href={`/orders/${c.orderId}`} target="_blank" className="shrink-0">
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0"><ExternalLink className="h-3 w-3" /></Button>
                                </Link>
                            </div>
                        ))}
                        <Link href="/admin/claims" className="block text-xs text-primary hover:underline pt-1">Ver todos los reclamos →</Link>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                {/* CBU para liquidaciones */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Wallet className="h-4 w-4 text-primary" /> CBU para liquidaciones
                        </CardTitle>
                        <CardDescription>
                            {store.payoutCbu
                                ? 'CBU/alias guardado — la liquidación automática lo usará.'
                                : 'Sin CBU guardado — la liquidación automática omitirá esta tienda.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {!store.payoutCbu && (
                            <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg p-2.5">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                Esta tienda no recibirá liquidaciones automáticas hasta que se configure un CBU.
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Input
                                value={cbuInput}
                                onChange={e => setCbuInput(e.target.value)}
                                placeholder="CBU, CVU o alias de MercadoPago"
                            />
                            <Button onClick={handleSaveCbu} disabled={savingCbu || cbuInput.trim() === (store.payoutCbu || '')} className="gap-1.5 shrink-0">
                                {savingCbu ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                Guardar
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Reseñas recientes */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Star className="h-4 w-4 text-warning" /> Reseñas recientes
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {reviewsLoading && <Skeleton className="h-16" />}
                        {!reviewsLoading && (!reviews || reviews.length === 0) && (
                            <p className="text-sm text-muted-foreground text-center py-4">Sin reseñas todavía.</p>
                        )}
                        {reviews?.map(r => (
                            <div key={r.id} className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <div className="flex gap-0.5">
                                        {[1,2,3,4,5].map(s => (
                                            <Star key={s} className={cn('h-3 w-3', r.rating >= s ? 'fill-warning text-warning' : 'text-muted-foreground/30')} />
                                        ))}
                                    </div>
                                    <span className="text-xs font-medium">{r.userName}</span>
                                    <span className="text-xs text-muted-foreground ml-auto">{formatDate(r.createdAt)}</span>
                                </div>
                                {r.comment && <p className="text-xs text-muted-foreground pl-0.5 line-clamp-2">{r.comment}</p>}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            {/* Pedidos recientes */}
            <Card className="shadow-md">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ShoppingBag className="h-4 w-4 text-info" /> Últimos pedidos
                        <span className="text-xs font-normal text-muted-foreground">(50 de {orders?.length ?? 0} cargados)</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {ordersLoading ? (
                        <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10" />)}</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b bg-muted/30">
                                    <tr>
                                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fecha</th>
                                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total</th>
                                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Estado</th>
                                        <th className="px-4 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {(!orders || orders.length === 0) && (
                                        <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Sin pedidos.</td></tr>
                                    )}
                                    {orders?.slice(0, 50).map(o => {
                                        const kind = getOrderStatusKind(o.status);
                                        return (
                                            <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                                                <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(o.createdAt)}</td>
                                                <td className="px-4 py-2.5 font-medium">{o.customerName}</td>
                                                <td className="px-4 py-2.5 text-right font-bold">${o.total?.toLocaleString()}</td>
                                                <td className="px-4 py-2.5">
                                                    <Badge variant="outline" className={cn('text-[10px] uppercase', orderStatusBadgeClass[kind])}>
                                                        {o.status}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <Link href={`/orders/${o.id}`} target="_blank">
                                                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                                                            <ExternalLink className="h-3 w-3" />
                                                        </Button>
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function AdminStoreDetailPageGuarded({ params }: { params: { storeId: string } }) {
    return <AdminAuthGuard><AdminStoreDetailPage params={params} /></AdminAuthGuard>;
}
