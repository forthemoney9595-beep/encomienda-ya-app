'use client';

import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, DollarSign, PackageCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import type { Order as OrderType } from '@/lib/order-service';
import type { Store as StoreType } from '@/lib/placeholder-data';
import { collection, query, where, CollectionReference, Timestamp } from 'firebase/firestore';
import { BarChart as RechartsBarChart, PieChart as RechartsPieChart, Pie, Bar, XAxis, YAxis, CartesianGrid, Legend, Cell } from 'recharts';
import { subDays, format, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import AdminAuthGuard from './admin-auth-guard';

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

// Helper seguro para obtener Date desde Timestamp o String
const getDate = (date: any): Date => {
    if (!date) return new Date();
    if (date instanceof Timestamp || (typeof date === 'object' && typeof date.toDate === 'function')) {
        return date.toDate();
    }
    return new Date(date);
};

// Usamos 'any' en el status para evitar conflictos con tipos estrictos viejos
const getStatusVariant = (status: any) => {
    switch (status) {
      case 'Entregado': return 'secondary';
      case 'En reparto': return 'default';
      case 'Pendiente de Pago': return 'default';
      case 'En preparación':
      case 'Pedido Realizado': return 'outline';
      case 'Pendiente de Confirmación': return 'outline';
      case 'Cancelado':
      case 'Rechazado': return 'destructive';
      default: return 'outline';
    }
};

function AdminDashboard() {
  const firestore = useFirestore();
  const router = useRouter();

  const ordersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'orders') as CollectionReference<OrderType> : null, [firestore]);
  const storesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'stores') as CollectionReference<StoreType> : null, [firestore]);
  // Usamos 'any' para usersQuery para evitar errores de importación de tipos
  const usersQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '!=', 'admin')) : null, [firestore]);

  const { data: orders, isLoading: ordersLoading } = useCollection<OrderType>(ordersQuery);
  const { data: stores, isLoading: storesLoading } = useCollection<StoreType>(storesQuery);
  const { data: users, isLoading: usersLoading } = useCollection<any>(usersQuery);
  
  const dashboardLoading = ordersLoading || storesLoading || usersLoading;

  const stats = useMemo(() => {
    if (!orders || !stores || !users) return { totalRevenue: 0, totalUsers: 0, completedOrders: 0, totalStores: 0 };
    
    const completed = orders.filter(o => o.status === 'Entregado');
    const totalRevenue = completed.reduce((sum, order) => sum + order.total, 0);
    
    return {
      totalRevenue,
      totalUsers: users.length,
      completedOrders: completed.length,
      totalStores: stores.length,
    }

  }, [orders, stores, users]);

  const salesData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => startOfDay(subDays(new Date(), i))).reverse();
    const completedOrders = orders?.filter(o => o.status === 'Entregado') || [];
    
    return last7Days.map(day => {
        const dayString = format(day, 'yyyy-MM-dd');
        const salesForDay = completedOrders
            .filter(order => format(getDate(order.createdAt), 'yyyy-MM-dd') === dayString)
            .reduce((sum, order) => sum + order.total, 0);

        return {
            date: format(day, 'EEE', { locale: es }),
            Ventas: salesForDay,
        };
    });
  }, [orders]);

  const orderStatusData = useMemo(() => {
    if (!orders) return [];
    const statusCounts = orders.reduce((acc, order) => {
        const status = order.status || 'Desconocido';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  }, [orders]);

  const allOrdersSorted = useMemo(() => {
    if (!orders) return [];
    return [...orders].sort((a,b) => getDate(b.createdAt).getTime() - getDate(a.createdAt).getTime());
  }, [orders]);

  
  if (dashboardLoading) {
    return (
       <div className="container mx-auto">
        <PageHeader title="Panel de Administración" description="Resumen y estadísticas de la plataforma." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <div className="grid gap-4 mt-4 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto">
      <PageHeader title="Panel de Administración" description="Resumen y estadísticas de la plataforma." />
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">de pedidos completados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuarios Registrados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">compradores, tiendas y repartidores</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Completados</CardTitle>
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedOrders}</div>
            <p className="text-xs text-muted-foreground">pedidos entregados con éxito</p>
          </CardContent>
        </Card>
      </div>

       <div className="grid gap-4 mt-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Ventas de los Últimos 7 Días</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
             <ChartContainer config={{ Ventas: { label: "Ventas", color: "hsl(var(--chart-1))" }}} className="h-[300px] w-full">
                <RechartsBarChart accessibilityLayer data={salesData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={10} tickFormatter={(value) => `$${value}`} />
                   <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" formatter={(value) => `$${Number(value).toFixed(2)}`} />} />
                  <Bar dataKey="Ventas" fill="var(--color-Ventas)" radius={4} />
                </RechartsBarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Distribución de Pedidos</CardTitle>
             <CardDescription>Estado actual de todos los pedidos.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[300px] w-full">
              <RechartsPieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie data={orderStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="hsl(var(--chart-1))" label={(entry) => `${entry.name} (${entry.value})`}>
                      {orderStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                  </Pie>
                  <Legend />
              </RechartsPieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
      <div className="mt-6">
        <Card>
            <CardHeader>
                <CardTitle>Historial de Pedidos</CardTitle>
                <CardDescription>Todos los pedidos realizados en la plataforma.</CardDescription>
            </CardHeader>
            <CardContent>
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Pedido</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Tienda</TableHead>
                            <TableHead>Repartidor</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                    {allOrdersSorted.length > 0 ? (
                        allOrdersSorted.map((order) => (
                        <TableRow key={order.id} className="cursor-pointer" onClick={() => router.push(`/orders/${order.id}`)}>
                            <TableCell className="font-medium">
                                <Link href={`/orders/${order.id}`} className="hover:underline">#{order.id.substring(0, 7)}</Link>
                            </TableCell>
                             <TableCell>{order.customerName}</TableCell>
                             <TableCell>{order.storeName}</TableCell>
                             <TableCell>{order.deliveryPersonName || 'N/A'}</TableCell>
                            <TableCell>
                               <Badge variant={getStatusVariant(order.status)}>{order.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-bold">${order.total.toFixed(2)}</TableCell>
                        </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                                No hay pedidos en el historial.
                            </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function GuardedAdminDashboard() {
  return (
    <AdminAuthGuard>
      <AdminDashboard />
    </AdminAuthGuard>
  );
}