'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/auth-context';
// ✅ Usamos useCollection para buscar la tienda por ownerId
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy, doc } from 'firebase/firestore';
import { authedFetch } from '@/lib/authed-fetch';
import type { Order } from '@/lib/order-service';
import { storeNetForOrder } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns'; 
import { es } from 'date-fns/locale'; 
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const formatDate = (date: any) => {
    if (!date) return 'Fecha desc.';
    try {
        let dateObj: Date;
        if (typeof date.toDate === 'function') dateObj = date.toDate();
        else if (date instanceof Date) dateObj = date;
        else return 'Fecha desc.';
        return format(dateObj, "d MMM HH:mm", { locale: es });
    } catch (error) { return 'Fecha desc.'; }
};

export default function StoreWalletPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [cbu, setCbu] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Validar Rol — en un useEffect (Tanda A de la auditoría): antes el router.push
  // corría DURANTE el render (efecto secundario en render, warning de React y
  // comportamiento errático en re-renders).
  useEffect(() => {
      if (!authLoading && userProfile && userProfile.role !== 'store') {
          router.push('/');
      }
  }, [authLoading, userProfile, router]);

  // 2. BUSCAR LA TIENDA DE ESTE USUARIO (CORRECCIÓN)
  // En lugar de buscar por ID directo, buscamos donde ownerId sea igual al usuario actual
  const storeQuery = useMemoFirebase(() => {
      if (!firestore || !user?.uid) return null;
      return query(collection(firestore, 'stores'), where('ownerId', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: userStores, isLoading: storeLoading } = useCollection<any>(storeQuery);
  
  // Tomamos la primera tienda encontrada (asumiendo 1 tienda por usuario)
  const myStore = userStores && userStores.length > 0 ? userStores[0] : null;
  const storeId = myStore?.id; // Este es el ID real del documento de la tienda

  // Comisión por defecto de la plataforma, para tiendas sin tarifa propia (mismo criterio
  // que payout-service.ts en el servidor).
  const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'config', 'platform') : null), [firestore]);
  const { data: platformConfig } = useDoc<{ defaultCommissionRate?: number }>(configRef);

  // 3. Traer VENTAS (Usando el storeId real encontrado)
  const salesQuery = useMemoFirebase(() => {
    if (!firestore || !storeId) return null;
    return query(
      collection(firestore, 'orders'),
      where('storeId', '==', storeId), 
      where('status', '==', 'Entregado'), 
      orderBy('createdAt', 'desc')
    );
  }, [firestore, storeId]);

  const { data: orders, isLoading: ordersLoading } = useCollection<Order>(salesQuery);

  // 4. Traer RETIROS
  const withdrawalsQuery = useMemoFirebase(() => {
      if (!firestore || !user?.uid) return null;
      // `userRole` es obligatorio: sin él, un dueño de tienda que además sea repartidor
      // veía acá descontados también sus retiros como repartidor (y viceversa), o sea un
      // saldo menor del que el servidor le aprobaría. El servidor sí filtra por rol
      // (payout-service.ts), así que sin esto las dos cifras no coinciden.
      return query(
          collection(firestore, 'withdrawals'),
          where('userId', '==', user.uid),
          where('userRole', '==', 'store'),
          orderBy('createdAt', 'desc')
      );
  }, [firestore, user?.uid]);

  const { data: withdrawals, isLoading: withdrawalsLoading } = useCollection<any>(withdrawalsQuery);

  // 5. Calcular Balance
  const financialSummary = useMemo(() => {
      const sales = orders || [];
      const withdrawalHistory = withdrawals || [];

      // OJO: esta fórmula tiene que dar EXACTAMENTE lo mismo que computeStoreBalance() en
      // src/lib/payout-service.ts, que es la que valida el servidor al aprobar un retiro.
      // Si no coinciden, la tienda ve un saldo mayor del que puede cobrar y el retiro le
      // rebota sin explicación. (Pasó: acá se sumaban los pedidos en efectivo y los
      // reembolsados, y la comisión caía en `|| 0` para tiendas sin tarifa propia.)
      const commissionRate = (typeof myStore?.commissionRate === 'number' && myStore.commissionRate > 0)
        ? myStore.commissionRate
        : (platformConfig?.defaultCommissionRate ?? 10);

      // Misma función que usa el servidor al aprobar un retiro (src/lib/money.ts): sin
      // efectivo, sin la parte reembolsada, con la comisión congelada del pedido, y sobre
      // el valor de los productos (el serviceFee es de la plataforma).
      const totalSalesRevenue = sales.reduce((sum, order) => sum + storeNetForOrder(order, commissionRate), 0);

      const totalWithdrawn = withdrawalHistory
          .filter(w => w.status !== 'rejected')
          .reduce((sum, w) => sum + (w.amount || 0), 0);

      const availableBalance = totalSalesRevenue - totalWithdrawn;

      return {
          totalSalesRevenue,
          totalWithdrawn,
          availableBalance: Math.max(0, availableBalance),
          sales,
          commissionRate // Lo mostramos en la UI
      };
  }, [orders, withdrawals, myStore, platformConfig]);

  const handleRequestWithdrawal = async () => {
      if (!firestore || !user) return;
      const amount = parseFloat(withdrawAmount);
      
      if (isNaN(amount) || amount <= 0 || amount > financialSummary.availableBalance) {
          toast({ variant: "destructive", title: "Monto inválido o insuficiente" });
          return;
      }
      if (!cbu || cbu.length < 5) {
          toast({ variant: "destructive", title: "Ingresa un CBU válido" });
          return;
      }

      setIsSubmitting(true);
      try {
          // Va por API: el saldo se valida en el SERVIDOR con la misma fórmula que usa la
          // aprobación. Antes era un addDoc directo y el único control del monto era este
          // JavaScript — desde la consola del navegador se podía crear un retiro de
          // cualquier monto, que además congelaba la liquidación automática de la tienda.
          // La API también guarda el CBU para las liquidaciones.
          const res = await authedFetch('/api/withdrawals/request', user, {
              role: 'store', amount, cbu,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error al procesar');
          toast({ title: "Solicitud enviada" });
          setIsWithdrawOpen(false);
          setWithdrawAmount('');
      } catch (error: any) {
          console.error(error);
          toast({ variant: "destructive", title: "Error al procesar", description: error.message });
      } finally {
          setIsSubmitting(false);
      }
  };

  if (authLoading || ordersLoading || withdrawalsLoading || storeLoading) {
      return <div className="container mx-auto py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader title="Billetera de Tienda" description={`Gestión financiera de ${myStore?.name || 'mi tienda'}.`} />

      <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30 shadow-md">
          <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" /> Saldo Disponible
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                  Neto (Comisión actual: {financialSummary.commissionRate}%)
              </CardDescription>
          </CardHeader>
          <CardContent>
              <div className="text-4xl font-bold text-foreground mb-4">
                  ${financialSummary.availableBalance.toLocaleString()}
              </div>
              <Dialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen}>
                  <DialogTrigger asChild>
                      <Button className="shadow-sm">Solicitar Retiro</Button>
                  </DialogTrigger>
                  <DialogContent>
                      <DialogHeader>
                          <DialogTitle>Retirar Fondos</DialogTitle>
                          <DialogDescription>Transferencia a cuenta bancaria.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                          <div className="space-y-2">
                              <Label>Monto</Label>
                              <Input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
                              <p className="text-xs text-muted-foreground">Disponible: ${financialSummary.availableBalance}</p>
                          </div>
                          <div className="space-y-2">
                              <Label>CBU / Alias</Label>
                              <Input value={cbu} onChange={(e) => setCbu(e.target.value)} placeholder="Ej: mi.tienda.mp" />
                          </div>
                      </div>
                      <DialogFooter>
                          <Button onClick={handleRequestWithdrawal} disabled={isSubmitting}>Confirmar</Button>
                      </DialogFooter>
                  </DialogContent>
              </Dialog>
          </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ventas Totales</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-success">+${financialSummary.totalSalesRevenue.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Retirado</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-muted-foreground">-${financialSummary.totalWithdrawn.toLocaleString()}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="history" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="history">Retiros</TabsTrigger>
              <TabsTrigger value="sales">Ventas</TabsTrigger>
          </TabsList>
          <TabsContent value="history">
              <Card>
                  <CardHeader><CardTitle>Historial de Retiros</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                      {withdrawals?.map((w: any) => (
                          <div key={w.id} className="p-3 border rounded text-sm space-y-1.5">
                              <div className="flex justify-between items-center gap-2">
                                  <span className="flex items-center gap-2">
                                      ${(w.amount || 0).toLocaleString('es-AR')} - {formatDate(w.createdAt)}
                                      {w.source === 'auto' && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Automático</Badge>}
                                  </span>
                                  <Badge variant={w.status === 'approved' ? 'default' : w.status === 'rejected' ? 'destructive' : 'secondary'}>
                                      {w.status === 'approved' ? 'Pagado' : w.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                                  </Badge>
                              </div>
                              {/* El motivo del rechazo se guardaba pero no se mostraba en ningún
                                  lado: la tienda veía "Rechazado" y no sabía qué corregir. */}
                              {w.status === 'rejected' && w.rejectionReason && (
                                  <p className="rounded border-l-2 border-destructive/40 bg-destructive/5 px-2 py-1 text-xs text-muted-foreground">
                                      {w.rejectionReason}
                                  </p>
                              )}
                              {/* Comprobante de la transferencia: es lo que le permite
                                  reclamar/rastrear el pago en su banco. */}
                              {w.status === 'approved' && w.operationRef && (
                                  <p className="text-xs text-muted-foreground">
                                      Comprobante: <span className="font-mono">{w.operationRef}</span>
                                      {w.processedAt && ` · ${formatDate(w.processedAt)}`}
                                  </p>
                              )}
                          </div>
                      ))}
                      {withdrawals?.length === 0 && <p className="text-center text-muted-foreground py-4">Sin retiros aún.</p>}
                  </CardContent>
              </Card>
          </TabsContent>
          <TabsContent value="sales">
              <Card>
                  <CardHeader><CardTitle>Últimas Ventas</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                      {/* El monto por venta usa la MISMA función que el titular de arriba.
                          Antes calculaba aparte (sin descontar reembolsos ni excluir
                          efectivo) y sin redondear, así que la lista no sumaba el total y
                          aparecían cifras como $9449.999999999998. */}
                      {orders?.map((o) => {
                          const neto = storeNetForOrder(o, financialSummary.commissionRate);
                          return (
                              <div key={o.id} className="flex justify-between items-center p-3 border rounded text-sm">
                                  <span>
                                      Orden #{o.id.slice(0,6)}
                                      {o.refunded && <span className="ml-2 text-xs text-destructive">reembolsada</span>}
                                  </span>
                                  <span className={cn('font-bold', neto > 0 ? 'text-success' : 'text-muted-foreground')}>
                                      +${Math.round(neto).toLocaleString('es-AR')}
                                  </span>
                              </div>
                          );
                      })}
                      {orders?.length === 0 && <p className="text-center text-muted-foreground py-4">No hay ventas entregadas.</p>}
                  </CardContent>
              </Card>
          </TabsContent>
      </Tabs>
    </div>
  );
}