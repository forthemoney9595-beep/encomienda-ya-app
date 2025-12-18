'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import type { Order } from '@/lib/order-service';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Truck, CreditCard, Wallet, History, AlertCircle, Loader2 } from 'lucide-react';
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

// ✅ FUNCIÓN AUXILIAR: Maneja fechas de forma segura
const formatDate = (date: any) => {
    if (!date) return 'Fecha desc.';
    try {
        let dateObj: Date;
        if (typeof date.toDate === 'function') {
             dateObj = date.toDate();
        } else if (date instanceof Date) {
            dateObj = date;
        } else {
            return 'Fecha desc.';
        }
        return format(dateObj, "d MMM HH:mm", { locale: es });
    } catch (error) {
        return 'Fecha desc.';
    }
};

export default function DeliveryEarningsPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  // Estados para el formulario de retiro
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [cbu, setCbu] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Seguridad: Redirigir si no es repartidor
  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'delivery')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  // 2. Traer TODAS las órdenes entregadas (INGRESOS)
  const earningsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'orders'),
      where('deliveryPersonId', '==', user.uid),
      where('status', '==', 'Entregado'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, user?.uid]);

  const { data: orders, isLoading: ordersLoading } = useCollection<Order>(earningsQuery);

  // 3. Traer TODOS los retiros (EGRESOS)
  const withdrawalsQuery = useMemoFirebase(() => {
      if (!firestore || !user?.uid) return null;
      return query(
          collection(firestore, 'withdrawals'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
      );
  }, [firestore, user?.uid]);

  const { data: withdrawals, isLoading: withdrawalsLoading } = useCollection<any>(withdrawalsQuery);

  // 4. Cálculos Financieros
  const financialSummary = useMemo(() => {
      const deliveredOrders = orders || [];
      const withdrawalHistory = withdrawals || [];

      // Total histórico ganado
      const totalEarned = deliveredOrders.reduce((sum, order) => sum + (order.deliveryFee || 0), 0);
      
      // Total retirado (Aprobado o Pendiente cuenta como "no disponible")
      const totalWithdrawn = withdrawalHistory
          .filter(w => w.status !== 'rejected') // Ignoramos los rechazados, esos vuelven al saldo
          .reduce((sum, w) => sum + (w.amount || 0), 0);

      const availableBalance = totalEarned - totalWithdrawn;

      return {
          totalEarned,
          totalWithdrawn,
          availableBalance: Math.max(0, availableBalance), // Evitar negativos visuales
          deliveredOrders
      };
  }, [orders, withdrawals]);

  // 5. Manejar Solicitud de Retiro
  const handleRequestWithdrawal = async () => {
      if (!firestore || !user) return;
      
      const amount = parseFloat(withdrawAmount);
      if (isNaN(amount) || amount <= 0) {
          toast({ variant: "destructive", title: "Monto inválido" });
          return;
      }
      if (amount > financialSummary.availableBalance) {
          toast({ variant: "destructive", title: "Saldo insuficiente" });
          return;
      }
      if (!cbu || cbu.length < 5) {
          toast({ variant: "destructive", title: "Ingresa un CBU/Alias válido" });
          return;
      }

      setIsSubmitting(true);
      try {
          await addDoc(collection(firestore, 'withdrawals'), {
              userId: user.uid,
              userName: userProfile?.displayName || userProfile?.name || 'Repartidor',
              userRole: 'delivery',
              amount: amount,
              cbu: cbu,
              status: 'pending', // Estado inicial
              createdAt: serverTimestamp()
          });

          toast({ 
              title: "Solicitud enviada", 
              description: "El administrador revisará tu retiro pronto." 
          });
          setIsWithdrawOpen(false);
          setWithdrawAmount('');
          // No borramos el CBU para que sea cómodo la próxima vez (opcional)
      } catch (error) {
          console.error(error);
          toast({ variant: "destructive", title: "Error al solicitar retiro" });
      } finally {
          setIsSubmitting(false);
      }
  };

  if (authLoading || ordersLoading || withdrawalsLoading) {
    return (
        <div className="container mx-auto space-y-4 pb-20">
            <PageHeader title="Mis Finanzas" description="Calculando balance..." />
            <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
            </div>
        </div>
    );
  }

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader 
        title="Billetera Digital" 
        description={`Gestión financiera para ${userProfile?.displayName || 'Repartidor'}.`} 
      />

      {/* TARJETA PRINCIPAL: BALANCE DISPONIBLE */}
      <Card className="bg-gradient-to-br from-green-50 to-emerald-100 border-green-200 shadow-md">
          <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium text-green-800 flex items-center gap-2">
                  <Wallet className="h-5 w-5" /> Saldo Disponible
              </CardTitle>
              <CardDescription className="text-green-700/80">Dinero listo para retirar</CardDescription>
          </CardHeader>
          <CardContent>
              <div className="text-4xl font-bold text-green-900 mb-4">
                  ${financialSummary.availableBalance.toLocaleString()}
              </div>
              
              <Dialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen}>
                  <DialogTrigger asChild>
                      <Button className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto font-bold shadow-sm">
                          Solicitar Retiro
                      </Button>
                  </DialogTrigger>
                  <DialogContent>
                      <DialogHeader>
                          <DialogTitle>Solicitar Transferencia</DialogTitle>
                          <DialogDescription>
                              El dinero será enviado a tu cuenta bancaria o MercadoPago.
                          </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                          <div className="space-y-2">
                              <Label>Monto a retirar</Label>
                              <div className="relative">
                                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                  <Input 
                                      type="number" 
                                      placeholder="0.00" 
                                      className="pl-7 font-bold text-lg"
                                      value={withdrawAmount}
                                      onChange={(e) => setWithdrawAmount(e.target.value)}
                                  />
                              </div>
                              <p className="text-xs text-muted-foreground">Máximo disponible: ${financialSummary.availableBalance}</p>
                          </div>
                          <div className="space-y-2">
                              <Label>CBU, CVU o Alias</Label>
                              <Input 
                                  placeholder="Ej: mi.alias.mp" 
                                  value={cbu}
                                  onChange={(e) => setCbu(e.target.value)}
                              />
                          </div>
                      </div>
                      <DialogFooter>
                          <Button variant="outline" onClick={() => setIsWithdrawOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                          <Button onClick={handleRequestWithdrawal} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirmar
                          </Button>
                      </DialogFooter>
                  </DialogContent>
              </Dialog>
          </CardContent>
      </Card>

      {/* METRICAS SECUNDARIAS */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" /> Ganancias Históricas
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">${financialSummary.totalEarned.toLocaleString()}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <History className="h-4 w-4" /> Total Retirado
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-orange-600">${financialSummary.totalWithdrawn.toLocaleString()}</div>
            </CardContent>
        </Card>
      </div>

      {/* PESTAÑAS DE HISTORIAL */}
      <Tabs defaultValue="withdrawals" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="withdrawals">Retiros</TabsTrigger>
              <TabsTrigger value="earnings">Ingresos (Entregas)</TabsTrigger>
          </TabsList>

          {/* TABLA DE RETIROS */}
          <TabsContent value="withdrawals">
              <Card>
                  <CardHeader>
                      <CardTitle className="text-base">Historial de Solicitudes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      {(!withdrawals || withdrawals.length === 0) ? (
                          <div className="text-center py-8 text-muted-foreground text-sm border-dashed border-2 rounded">
                              No has realizado retiros aún.
                          </div>
                      ) : (
                          withdrawals.map((w: any) => (
                              <div key={w.id} className="flex items-center justify-between p-3 border rounded-lg bg-card text-sm">
                                  <div>
                                      <p className="font-bold">${w.amount.toLocaleString()}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(w.createdAt)}</p>
                                  </div>
                                  <Badge variant={
                                      w.status === 'approved' ? 'default' : 
                                      w.status === 'rejected' ? 'destructive' : 'secondary'
                                  } className={w.status === 'approved' ? 'bg-green-600' : w.status === 'pending' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}>
                                      {w.status === 'approved' ? 'Pagado' : 
                                       w.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                                  </Badge>
                              </div>
                          ))
                      )}
                  </CardContent>
              </Card>
          </TabsContent>

          {/* TABLA DE INGRESOS (Orders) */}
          <TabsContent value="earnings">
              <Card>
                  <CardHeader>
                      <CardTitle className="text-base">Historial de Entregas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {financialSummary.deliveredOrders.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                            <Truck className="mx-auto h-8 w-8 mb-2 opacity-50" />
                            <p>Aún no has completado ninguna entrega.</p>
                        </div>
                    ) : (
                        financialSummary.deliveredOrders.map((order) => (
                            <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm">{order.storeName}</span>
                                        <span className="text-[10px] text-muted-foreground">{formatDate(order.createdAt)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <CreditCard className="h-3 w-3" /> Pago Digital
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="block font-bold text-green-600">+${order.deliveryFee}</span>
                                </div>
                            </div>
                        ))
                    )}
                  </CardContent>
              </Card>
          </TabsContent>
      </Tabs>
    </div>
  );
}