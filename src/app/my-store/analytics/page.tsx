'use client';

import { useAuth } from '@/context/auth-context';
import { usePrototypeData } from '@/context/prototype-data-context';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { subDays, format, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Package, ShoppingCart, Banknote, Crown, User, TrendingUp } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPlaceholderImage } from '@/lib/placeholder-images';

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

    const topProducts = useMemo(() => {
        const productSales = new Map<string, { name: string, quantity: number, revenue: number, imageUrl?: string }>();
        storeOrders.forEach(order => {
            order.items.forEach(item => {
                const existing = productSales.get(item.id);
                const revenue = item.price * item.quantity;
                if (existing) {
                    existing.quantity += item.quantity;
                    existing.revenue += revenue;
                } else {
                    productSales.set(item.id, { name: item.name, quantity: item.quantity, revenue, imageUrl: item.imageUrl });
                }
            });
        });
        return Array.from(productSales.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 3);
    }, [storeOrders]);

    const topCustomers = useMemo(() => {
        const customerData = new Map<string, { name: string, orders: number, total: number }>();
        storeOrders.forEach(order => {
            const customerId = order.userId;
            const customerName = order.customerName || 'Cliente Anónimo';
            const existing = customerData.get(customerId);
            if (existing) {
                existing.orders += 1;
                existing.total += order.total;
            } else {
                customerData.set(customerId, { name: customerName, orders: 1, total: order.total });
            }
        });
        return Array.from(customerData.values())
            .sort((a, b) => b.total - a.total)
            .slice(0, 3);
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
                    <div className="grid gap-4 mt-8 lg:grid-cols-2">
                        <Skeleton className="h-96" />
                        <div className="space-y-4">
                            <Skeleton className="h-48" />
                            <Skeleton className="h-48" />
                        </div>
                    </div>
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

             <div className="grid gap-6 mt-6 md:grid-cols-5">
                <Card className="md:col-span-3">
                    <CardHeader>
                        <CardTitle>Ventas de los Últimos 7 Días</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                       <ChartContainer config={{ Ventas: { label: "Ventas", color: "hsl(var(--chart-1))" }}} className="h-[350px] w-full">
                         <RechartsBarChart data={salesData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={10} tickFormatter={(value) => `$${value}`} />
                            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" formatter={(value) => `$${Number(value).toFixed(2)}`} />} />
                            <Bar dataKey="Ventas" fill="var(--color-Ventas)" radius={4} />
                        </RechartsBarChart>
                       </ChartContainer>
                    </CardContent>
                </Card>
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                           <CardTitle className="flex items-center gap-2"><TrendingUp /> Productos Más Vendidos</CardTitle>
                           <CardDescription>por ingresos generados.</CardDescription>
                        </CardHeader>
                        <CardContent>
                           {topProducts.length > 0 ? (
                             <Table>
                               <TableHeader>
                                 <TableRow>
                                   <TableHead>Producto</TableHead>
                                   <TableHead className="text-right">Ingresos</TableHead>
                                 </TableRow>
                               </TableHeader>
                               <TableBody>
                                 {topProducts.map((product, index) => (
                                   <TableRow key={index}>
                                     <TableCell className="flex items-center gap-2">
                                       <Avatar className="h-8 w-8">
                                         <AvatarImage src={product.imageUrl} alt={product.name}/>
                                         <AvatarFallback>{product.name.charAt(0)}</AvatarFallback>
                                       </Avatar>
                                       <span className="font-medium">{product.name}</span>
                                     </TableCell>
                                     <TableCell className="text-right font-bold">${product.revenue.toFixed(2)}</TableCell>
                                   </TableRow>
                                 ))}
                               </TableBody>
                             </Table>
                           ) : <p className="text-sm text-muted-foreground text-center py-4">No hay datos de productos.</p>}
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader>
                           <CardTitle className="flex items-center gap-2"><Crown /> Clientes Frecuentes</CardTitle>
                           <CardDescription>por total gastado.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {topCustomers.length > 0 ? (
                             <Table>
                               <TableHeader>
                                 <TableRow>
                                   <TableHead>Cliente</TableHead>
                                   <TableHead className="text-right">Total Gastado</TableHead>
                                 </TableRow>
                               </TableHeader>
                               <TableBody>
                                 {topCustomers.map((customer, index) => (
                                   <TableRow key={index}>
                                     <TableCell className="flex items-center gap-2">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={getPlaceholderImage(customer.name, 40, 40)} alt={customer.name} />
                                            <AvatarFallback>{customer.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                       <div>
                                            <p className="font-medium">{customer.name}</p>
                                            <p className="text-xs text-muted-foreground">{customer.orders} pedido(s)</p>
                                        </div>
                                     </TableCell>
                                     <TableCell className="text-right font-bold">${customer.total.toFixed(2)}</TableCell>
                                   </TableRow>
                                 ))}
                               </TableBody>
                             </Table>
                           ) : <p className="text-sm text-muted-foreground text-center py-4">No hay datos de clientes.</p>}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
