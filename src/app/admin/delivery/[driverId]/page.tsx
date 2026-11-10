'use client';

import { notFound, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Car, Mail, Phone, Star, PackageCheck, Wallet, TrendingUp, DollarSign,
  Check, XCircle, Save, Loader2, ExternalLink, AlertTriangle
} from 'lucide-react';
import { useState, useMemo } from 'react';
import type { DeliveryPersonnel } from '../delivery-personnel-list';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useDoc, useFirestore, useCollection, useMemoFirebase } from '@/lib/firebase';
import AdminAuthGuard from '../../admin-auth-guard';
import { collection, query, where, doc, updateDoc, orderBy, limit, CollectionReference } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { logAdminAction } from '@/lib/admin-audit';
import { setAccountApproval } from '@/lib/approval-service';
import { getOrderStatusKind, orderStatusBadgeClass } from '@/lib/order-status';
import { driverNetForOrder } from '@/lib/money';
import { AccountStatement } from '@/components/account-statement';
import { buildDriverStatement, type StatementOrder, type StatementWithdrawal } from '@/lib/account-movements';
import { type Order as OrderType } from '@/lib/order-service';
import Link from 'next/link';
import { publicName } from '@/lib/public-name';
import { SuspendAccountDialog } from '@/components/admin/suspend-account-dialog';
import { SuspensionPanel } from '@/components/admin/suspension-panel';
import type { AccountSuspension } from '@/lib/suspension';
import { PersonTile } from '@/components/admin/admin-list';
import { resolveStatus, SOFT_BADGE } from '@/components/admin/status-badge';
import { useAdminCrumbs } from '@/components/admin/admin-chrome';


const formatDate = (ts: any) => {
  if (!ts) return '—';
  try { return format(ts.toDate ? ts.toDate() : new Date(ts), 'd MMM HH:mm', { locale: es }); } catch { return '—'; }
};

function DriverProfilePage() {
  const params = useParams();
  const driverId = params.driverId as string;
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user: adminUser, userProfile: adminProfile } = useAuth();
  // El CBU define a qué cuenta se transfiere la plata: solo admin 'full' (regla + UI).
  const isSupport = (adminProfile as any)?.adminLevel === 'support';

  const [cbuInput, setCbuInput] = useState('');
  const [cbuLoaded, setCbuLoaded] = useState(false);
  const [savingCbu, setSavingCbu] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);

  const driverRef = useMemoFirebase(() => firestore ? doc(firestore, 'users', driverId) : null, [firestore, driverId]);
  const { data: driver, isLoading: driverLoading } = useDoc<DeliveryPersonnel>(driverRef);
  // Migas de la topbar: Operación › Repartidores › {nombre} (la ficha no usa AdminPage).
  useAdminCrumbs([{ label: 'Operación' }, { label: 'Repartidores', href: '/admin/delivery' }, { label: driver?.name || 'Repartidor' }]);

  if (driver && !cbuLoaded) {
    setCbuInput((driver as any).payoutCbu || '');
    setCbuLoaded(true);
  }

  const ordersQuery = useMemoFirebase(() =>
    firestore ? query(collection(firestore, 'orders'), where('deliveryPersonId', '==', driverId)) as CollectionReference<OrderType> : null,
    [firestore, driverId]
  );
  const { data: orders, isLoading: ordersLoading } = useCollection<OrderType>(ordersQuery);

  const withdrawalsQuery = useMemoFirebase(() =>
    firestore ? query(collection(firestore, 'withdrawals'), where('userId', '==', driverId), where('userRole', '==', 'delivery')) : null,
    [firestore, driverId]
  );
  const { data: withdrawals } = useCollection<any>(withdrawalsQuery);

  // Reseñas: colección dedicada (vía /api/delivery-reviews/create), no un escaneo de
  // pedidos -- mismo patrón que las reseñas de tienda en admin/stores/[storeId].
  const reviewsQuery = useMemoFirebase(() =>
    firestore ? query(collection(firestore, 'deliveryReviews'), where('driverId', '==', driverId), orderBy('createdAt', 'desc'), limit(10)) : null,
    [firestore, driverId]
  );
  const { data: reviews } = useCollection<any>(reviewsQuery);

  const stats = useMemo(() => {
    const delivered = (orders || []).filter(o => o.status === 'Entregado');
    // ⚠️ Antes era `o.deliveryFee || 0` a secas: no descontaba reembolsos ni excluía los
    // pedidos en efectivo, así que el admin veía un saldo MAYOR al que el servidor iba a
    // autorizar (`/api/admin/approve-withdrawal`) y el retiro se rechazaba sin explicación.
    // Ahora usa exactamente la misma regla de reparto que el servidor (src/lib/money.ts).
    const totalEarned = delivered.reduce((s, o) => s + driverNetForOrder(o as any), 0);
    // Retiros: hay que distinguir la plata que YA salió de la que está comprometida.
    // `rejected` no cuenta (esa plata volvió al saldo).
    let settled = 0, pending = 0;
    for (const w of withdrawals || []) {
      const amount = Number(w.amount) || 0;
      if (w.status === 'approved') settled += amount;
      else if (w.status === 'pending') pending += amount;
    }
    return {
      totalDeliveries: delivered.length,
      // El promedio real vive en users/{driverId}.rating (mantenido por una transacción
      // en /api/delivery-reviews/create), no se recalcula acá.
      avgRating: driver?.rating || 0,
      ratingCount: driver?.ratingCount || 0,
      totalEarned,
      pending,
      settled,
      availableBalance: Math.max(0, totalEarned - settled - pending),
      // Plata pagada de más (pasa si se reembolsa un pedido ya liquidado). Antes el
      // Math.max la escondía dejando el saldo en $0 sin decir por qué.
      debt: Math.max(0, settled - totalEarned),
    };
  }, [orders, withdrawals, driver]);

  // Estado de cuenta (Fase OO) — mismo componente y criterio que la ficha de tienda:
  // entregas netas via money.ts + retiros; el reembolso vive como detalle de la entrega
  // (ya está descontado en el neto, una fila aparte lo restaría dos veces).
  const statement = useMemo(
    // Armado único (src/lib/account-movements.ts), compartido con la billetera del repartidor.
    () => buildDriverStatement((orders || []) as StatementOrder[], (withdrawals || []) as StatementWithdrawal[]).movements,
    [orders, withdrawals],
  );

  const recentOrders = useMemo(() => {
    return [...(orders || [])]
      .sort((a, b) => {
        const da = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : new Date(a.createdAt as any);
        const db = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : new Date(b.createdAt as any);
        return db.getTime() - da.getTime();
      })
      .slice(0, 15);
  }, [orders]);

  const handleSaveCbu = async () => {
    if (!driverRef) return;
    setSavingCbu(true);
    try {
      await updateDoc(driverRef, { payoutCbu: cbuInput.trim() });
      // Mismo criterio que el CBU de tienda: define a qué cuenta va la plata, se audita.
      if (firestore && adminUser) logAdminAction(firestore, adminUser.uid, 'edit_cbu', driverId, `repartidor — CBU ...${cbuInput.trim().slice(-4)}`);
      toast({ title: 'CBU guardado', description: 'La liquidación automática lo usará.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error al guardar' });
    } finally {
      setSavingCbu(false);
    }
  };

  // Solo ACTIVAR pasa por acá (servicio único de aprobación, Fase PP). Desactivar a un
  // repartidor aprobado ya no es un click: es "Suspender" (Fase YY ter, debido proceso —
  // motivo, detalle, duración y apelación). Una cuenta suspendida se levanta desde el panel
  // de suspensión (server-side), nunca con este botón.
  const handleActivate = async () => {
    if (!firestore) return;
    setUpdatingStatus(true);
    try {
      await setAccountApproval(firestore, {
        userId: driverId,
        approved: true,
        role: 'delivery',
        adminUser,
        label: 'repartidor — Activo',
      });
      toast({ title: 'Repartidor activado y notificado' });
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Error al cambiar estado', description: e instanceof Error ? e.message : undefined });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const isLoading = driverLoading || ordersLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto pb-20 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-48" /><Skeleton className="h-48 md:col-span-2" /></div>
      </div>
    );
  }

  if (!driver) return notFound();

  const cbuSaved = (driver as any).payoutCbu;
  const suspension = (driver as any).suspension as AccountSuspension | undefined;
  const isSuspended = suspension?.active === true || driver.status === ('Suspendido' as string);

  return (
    <div className="container mx-auto pb-20 space-y-6">
      {/* Header */}
      <div className="glass flex flex-wrap items-start gap-4 rounded-card p-4 sm:p-5" data-testid="driver-ficha-header">
        <PersonTile role="delivery" photo={(driver as any).profileImageUrl} className="h-16 w-16 rounded-[1rem] [&>svg]:h-8 [&>svg]:w-8" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-headline text-[1.75rem] font-extrabold leading-tight tracking-tight">{driver.name}</h1>
            <span className={cn('inline-flex h-[22px] items-center rounded-full px-2 text-xs font-semibold', SOFT_BADGE[resolveStatus('account', driver.status).tone])}>{driver.status}</span>
          </div>
          <div className="flex flex-col gap-1 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {driver.email}</span>
            <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {driver.phoneNumber || (driver as any).phone || 'No especificado'}</span>
            <span className="flex items-center gap-1.5 capitalize"><Car className="h-3.5 w-3.5" /> {typeof driver.vehicle === 'string' ? driver.vehicle : driver.vehicle?.type || 'N/A'}</span>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
          {driver.status !== 'Activo' && !isSuspended && (
            <Button size="sm" variant="outline" onClick={handleActivate} disabled={updatingStatus} className="gap-1.5">
              <Check className="h-3.5 w-3.5 text-success-ink" /> Activar
            </Button>
          )}
          {driver.status === 'Activo' && !isSuspended && (
            <Button size="sm" variant="outline" onClick={() => setSuspendOpen(true)} disabled={updatingStatus} className="gap-1.5" data-testid="open-suspend">
              <XCircle className="h-3.5 w-3.5 text-destructive-ink" /> Suspender
            </Button>
          )}
        </div>
      </div>

      <SuspendAccountDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        target={{ uid: driverId, role: 'delivery', name: driver.name || driver.email || 'repartidor' }}
      />

      {/* Suspensión vigente / apelaciones (Fase YY ter) */}
      <SuspensionPanel uid={driverId} name={driver.name || driver.email || 'el repartidor'} suspension={suspension ?? null} />

      {/* Métricas */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {[
          { label: 'Entregas', value: stats.totalDeliveries, icon: PackageCheck, color: 'text-info-ink', hint: '' },
          { label: 'Rating', value: stats.ratingCount > 0 ? `${stats.avgRating.toFixed(1)} ★` : '—', icon: Star, color: 'text-warning-ink', hint: '' },
          { label: 'Ganancias totales', value: `$${Math.round(stats.totalEarned).toLocaleString('es-AR')}`, icon: TrendingUp, color: 'text-success-ink', hint: 'envíos, neto de reembolsos' },
          {
            label: 'Saldo disponible', value: `$${Math.round(stats.availableBalance).toLocaleString('es-AR')}`,
            icon: DollarSign, color: 'text-primary',
            hint: stats.debt > 0
              ? `debe $${Math.round(stats.debt).toLocaleString('es-AR')}`
              : stats.pending > 0 ? `$${Math.round(stats.pending).toLocaleString('es-AR')} ya solicitados` : '',
          },
        ].map(({ label, value, icon: Icon, color, hint }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="pt-3 pb-3">
              <Icon className={cn('h-4 w-4 mb-1', color)} />
              <div className={cn('text-xl font-bold', color)}>{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
              {hint && <div className="text-xs text-muted-foreground/70 mt-0.5">{hint}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Estado de cuenta (Fase OO) — los totales son los de las tarjetas de arriba
          (misma fuente: stats), acá se ve el detalle movimiento por movimiento */}
      <AccountStatement
        movements={statement}
        summary={{
          earned: stats.totalEarned,
          paid: stats.settled,
          requested: stats.pending,
          balance: stats.availableBalance,
          debt: stats.debt,
        }}
        csvName={`estado-cuenta-${(driver.name || driverId).toString().replace(/\s+/g, '-').toLowerCase()}.csv`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* CBU */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4 text-primary" /> CBU para liquidaciones</CardTitle>
            <CardDescription>
              {cbuSaved ? 'CBU/alias guardado — la liquidación automática lo usará.' : 'Sin CBU guardado — la liquidación automática omitirá a este repartidor.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!cbuSaved && (
              <div className="flex items-center gap-2 text-xs text-warning-ink bg-warning/10 border border-warning/30 rounded-lg p-2.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                No recibirá liquidaciones automáticas hasta que se configure un CBU.
              </div>
            )}
            <div className="flex gap-2">
              <Input value={cbuInput} onChange={e => setCbuInput(e.target.value)} placeholder="CBU, CVU o alias de MercadoPago" disabled={isSupport} />
              <Button onClick={handleSaveCbu} disabled={isSupport || savingCbu || cbuInput.trim() === (cbuSaved || '')} className="gap-1.5 shrink-0">
                {savingCbu ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
              </Button>
            </div>
            {isSupport && (
              <p className="text-xs text-muted-foreground">Editar el CBU requiere un admin con acceso completo.</p>
            )}
          </CardContent>
        </Card>

        {/* Reseñas */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Star className="h-4 w-4 text-warning-ink" /> Reseñas de clientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(!reviews || reviews.length === 0) && <p className="text-sm text-muted-foreground text-center py-4">Sin reseñas todavía.</p>}
            {(reviews || []).map(r => (
              <div key={r.id} className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={cn('h-3 w-3', r.rating >= s ? 'fill-warning text-warning' : 'text-muted-foreground/30')} />
                    ))}
                  </div>
                  <span className="text-xs font-medium">{publicName(r.userName)}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{formatDate(r.createdAt)}</span>
                </div>
                {r.comment && <p className="text-xs text-muted-foreground pl-0.5 line-clamp-2 italic">&quot;{r.comment}&quot;</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Entregas recientes */}
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageCheck className="h-4 w-4 text-info-ink" /> Entregas recientes
            <span className="text-xs font-normal text-muted-foreground">({orders?.length ?? 0} totales)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fecha</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tienda</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Ganó</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentOrders.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Sin entregas.</td></tr>
                )}
                {recentOrders.map(o => {
                  const kind = getOrderStatusKind(o.status);
                  return (
                    <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(o.createdAt)}</td>
                      <td className="px-4 py-2.5 font-medium">{o.customerName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{(o as any).storeName || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-success-ink">
                        {/* Neto (Fase PP, N5): la tarjeta de arriba ya era neta y esta
                            columna mostraba el envío crudo — misma pantalla, dos bases. */}
                        {o.status === 'Entregado' ? `$${Math.round(driverNetForOrder(o as any)).toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={cn('text-xs uppercase', orderStatusBadgeClass[kind])}>{o.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/orders/${o.id}`} target="_blank">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0"><ExternalLink className="h-3 w-3" /></Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function GuardedDriverProfilePage() {
  return (
    <AdminAuthGuard>
      <DriverProfilePage />
    </AdminAuthGuard>
  );
}
