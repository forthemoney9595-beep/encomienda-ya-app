
'use client';

import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { subDays, format, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Package, ShoppingCart, Banknote } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

export default function StoreAnalyticsPage() {
    const { user, loading: authLoading } = useAuth();
    const { getOrdersByStore, loading: prototypeLoading } = usePrototypeData();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && (!user || user.role !== 'store')) {
            router.push('/');
        }
    }, [user, authLoading, router]);

    const storeOrders = useMemo(() => {
        if (!user?.storeId) return [];
        return getOrdersByStore(user.storeId).filter(order => order.status === 'Entregado');
    }, [user, getOrdersByStore]);

    const totalRevenue = useMemo(() => {
        return storeOrders.reduce((acc, order) => acc + order.total, 0);
    }, [storeOrders]);

    const totalOrders = storeOrders.length;
    
    const averageOrderValue = useMemo(() => {
        if (totalOrders === 0) return 0;
        return totalRevenue / totalOrders;
    }, [totalRevenue, totalOrders]);

    const salesData = useMemo(() => {
        const last7Days = Array.from({ length: 7 }, (_, i) => startOfDay(subDays(new Date(), i))).reverse();
        
        return last7Days.map(day => {
            const dayString = format(day, 'yyyy-MM-dd');
            const salesForDay = storeOrders
                .filter(order => format(new Date(order.createdAt), 'yyyy-MM-dd') === dayString)
                .reduce((sum, order) => sum + order.total, 0);

            return {
                date: format(day, 'EEE', { locale: es }), // Mon, Tue, etc.
                Ventas: salesForDay,
            };
        });
    }, [storeOrders]);


    if (authLoading || prototypeLoading || !user) {
        return (
            <div className="container mx-auto">
                <PageHeader title="Analíticas de la Tienda" description="Cargando tus métricas de rendimiento." />
                <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Skeleton className="h-28" />
                        <Skeleton className="h-28" />
                        <Skeleton className="h-28" />
                    </div>
                    <Skeleton className="h-80" />
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto">
            <PageHeader title="Analíticas de la Tienda" description="Métricas de rendimiento de tu negocio." />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
                        <Banknote className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">de todos los pedidos completados</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pedidos Completados</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">+{totalOrders}</div>
                        <p className="text-xs text-muted-foreground">pedidos entregados con éxito</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Valor Promedio por Pedido</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${averageOrderValue.toFixed(2)}</div>
                         <p className="text-xs text-muted-foreground">en todos los pedidos</p>
                    </CardContent>
                </Card>
            </div>

            <div className="mt-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Ventas de los Últimos 7 Días</CardTitle>
                    </CardHeader>
                    <CardContent className="h-80">
                       <ChartContainer config={{
                           Ventas: {
                               label: "Ventas",
                               color: "hsl(var(--chart-1))",
                           }
                       }}>
                         <BarChart data={salesData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={10} tickFormatter={(value) => `$${value}`} />
                            <ChartTooltip
                                cursor={false} 
                                content={<ChartTooltipContent 
                                    indicator="dot"
                                    formatter={(value) => `$${Number(value).toFixed(2)}`}
                                />} 
                            />
                            <Bar dataKey="Ventas" fill="var(--color-Ventas)" radius={4} />
                        </BarChart>
                       </ChartContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
