'use client';

import { useState, useMemo } from 'react';
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
import { collection, query, where, orderBy, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import type { Order } from '@/lib/order-service';
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

  // 1. Validar Rol
  if (!authLoading && userProfile?.role !== 'store') {
      router.push('/');
  }

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
      return query(
          collection(firestore, 'withdrawals'),
          where('userId', '==', user.uid),
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

      const totalSalesRevenue = sales.reduce((sum, order) => {
          // Efectivo: lo cobró el repartidor en mano, esa plata nunca entró a la plataforma.
          if (order.paymentMethod === 'Efectivo') return sum;

          const productTotal = (order.total || 0) - (order.deliveryFee || 0);
          const commission = productTotal * (commissionRate / 100);
          const netEarnings = Math.max(0, productTotal - commission);

          // Reembolsado: se descuenta la parte devuelta al comprador.
          const refundRatio = order.refunded
            ? Math.min(1, Math.max(0, (Number(order.refundAmount) || 0) / (Number(order.total) || 1)))
            : 0;

          return sum + netEarnings * (1 - refundRatio);
      }, 0);

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
          await addDoc(collection(firestore, 'withdrawals'), {
              userId: user.uid,
              userName: userProfile?.displayName || myStore?.name || 'Tienda',
              userRole: 'store',
              amount: amount,
              cbu: cbu,
              status: 'pending',
              source: 'manual',
              createdAt: serverTimestamp()
          });
          // Guardar el CBU una vez para que las liquidaciones automáticas lo usen
          if (storeId) {
              try { await updateDoc(doc(firestore, 'stores', storeId), { payoutCbu: cbu }); } catch {}
          }
          toast({ title: "Solicitud enviada" });
          setIsWithdrawOpen(false);
          setWithdrawAmount('');
      } catch (error) {
          console.error(error);
          toast({ variant: "destructive", title: "Error al procesar" });
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
                          <div key={w.id} className="flex justify-between items-center p-3 border rounded text-sm">
                              <span className="flex items-center gap-2">
                                  ${w.amount} - {formatDate(w.createdAt)}
                                  {w.source === 'auto' && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Automático</Badge>}
                              </span>
                              <Badge variant={w.status === 'approved' ? 'default' : w.status === 'rejected' ? 'destructive' : 'secondary'}>
                                  {w.status === 'approved' ? 'Pagado' : w.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                              </Badge>
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
                      {orders?.map((o) => (
                          <div key={o.id} className="flex justify-between items-center p-3 border rounded text-sm">
                              <span>Orden #{o.id.slice(0,6)}</span>
                              <span className="font-bold text-success">
                                  +${((o.total || 0) - (o.deliveryFee || 0)) * (1 - (financialSummary.commissionRate / 100))}
                              </span>
                          </div>
                      ))}
                      {orders?.length === 0 && <p className="text-center text-muted-foreground py-4">No hay ventas entregadas.</p>}
                  </CardContent>
              </Card>
          </TabsContent>
      </Tabs>
    </div>
  );
}