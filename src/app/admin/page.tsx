
'use client';

import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Store, Truck, ClipboardList, Package, Users, BarChart, FileText } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrototypeData } from '@/context/prototype-data-context';
import type { Store as StoreType, DeliveryPersonnel } from '@/lib/placeholder-data';
import { getAvailableOrdersForDelivery } from '@/lib/order-service';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { subDays, format, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';


export default function AdminDashboard() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const { getAvailableOrdersForDelivery: getPrototypeAvailableOrders, loading: prototypeLoading, prototypeStores, prototypeOrders, prototypeDelivery } = usePrototypeData();
  const isPrototype = user?.uid.startsWith('proto-') ?? false;

  const stats = useMemo(() => {
    if (prototypeLoading) return { totalStores: 0, totalDrivers: 0, pendingOrders: 0 };
    
    let availableOrderCount = 0;
    if (isPrototype) {
        availableOrderCount = getPrototypeAvailableOrders().length;
    } 
    // In a real app, you would fetch real data here
    
    return {
      totalStores: prototypeStores.length,
      totalDrivers: prototypeStores.filter(s => s.status === 'Aprobado').length > 0 ? 1 : 0, // Only one proto driver
      pendingOrders: availableOrderCount
    }

  }, [prototypeLoading, isPrototype, getPrototypeAvailableOrders, prototypeStores]);

  const salesData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => startOfDay(subDays(new Date(), i))).reverse();
    const completedOrders = prototypeOrders.filter(o => o.status === 'Entregado');
    
    return last7Days.map(day => {
        const dayString = format(day, 'yyyy-MM-dd');
        const salesForDay = completedOrders
            .filter(order => format(new Date(order.createdAt), 'yyyy-MM-dd') === dayString)
            .reduce((sum, order) => sum + order.total, 0);

        return {
            date: format(day, 'EEE', { locale: es }),
            Ventas: salesForDay,
        };
    });
  }, [prototypeOrders]);

  const pendingStores = useMemo(() => {
    return prototypeStores.filter(s => s.status === 'Pendiente').slice(0, 5); // Take latest 5
  }, [prototypeStores]);


  useEffect(() => {
    if (!loading && !isAdmin) {
      router.push('/login');
    }
  }, [loading, isAdmin, router]);

   useEffect(() => {
    if (isAdmin && !prototypeLoading) {
        setDashboardLoading(false);
    }
  }, [user, isAdmin, loading, router, prototypeLoading]);
  
  if (loading || dashboardLoading || !isAdmin) {
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tiendas Totales</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStores}</div>
            <p className="text-xs text-muted-foreground">tiendas gestionadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conductores Activos</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDrivers}</div>
            <p className="text-xs text-muted-foreground">personal de reparto activo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Pendientes</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingOrders}</div>
            <p className="text-xs text-muted-foreground">pedidos por completar</p>
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
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    tickFormatter={(value) => `$${value}`}
                  />
                   <ChartTooltip
                        cursor={false} 
                        content={<ChartTooltipContent 
                            indicator="dot"
                            formatter={(value) => `$${Number(value).toFixed(2)}`}
                        />} 
                    />
                  <Bar dataKey="Ventas" fill="var(--color-Ventas)" radius={4} />
                </RechartsBarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
            <CardDescription>
              Nuevas tiendas pendientes de aprobación.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Tienda</TableHead>
                        <TableHead>Categoría</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                {pendingStores.length > 0 ? (
                    pendingStores.map((store) => (
                    <TableRow key={store.id}>
                        <TableCell>
                            <Link href="/admin/stores" className="font-medium hover:underline">{store.name}</Link>
                        </TableCell>
                        <TableCell>
                            <Badge variant="outline">{store.category}</Badge>
                        </TableCell>
                    </TableRow>
                    ))
                ) : (
                    <TableRow>
                        <TableCell colSpan={2} className="h-24 text-center">
                            No hay nuevas tiendas pendientes.
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
