'use client';

import { useAuth, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, PackageCheck, DollarSign, TrendingUp, TrendingDown, Bot } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import type { Order } from '@/lib/order-service';
import { collection, query, where } from 'firebase/firestore';

function ReviewList({ reviews }: { reviews: Order[] }) {
    if (reviews.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-10">
                <p>Aún no has recibido ninguna reseña.</p>
            </div>
        );
    }
    return (
        <div className="space-y-4">
            {reviews.map(review => (
                <Card key={review.id}>
                    <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-semibold">Pedido de {review.storeName}</p>
                                <p className="text-sm text-muted-foreground">{format(review.createdAt, "d 'de' MMMM, yyyy", { locale: es })}</p>
                            </div>
                            <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <Star key={star} className={`h-4 w-4 ${review.deliveryRating && review.deliveryRating >= star ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`} />
                                ))}
                            </div>
                        </div>
                        {review.deliveryReview && (
                            <blockquote className="mt-3 border-l-2 pl-4 italic text-muted-foreground">
                                "{review.deliveryReview}"
                            </blockquote>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export default function DeliveryStatsPage() {
    const { user, userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();

    const deliveriesQuery = useMemoFirebase(() => {
        if (!firestore || !user?.uid) return null;
        return query(
            collection(firestore, 'orders'),
            where('deliveryPersonId', '==', user.uid)
        );
    }, [firestore, user?.uid]);
    
    const { data: deliveries, isLoading: deliveriesLoading } = useCollection<Order>(deliveriesQuery);

    useEffect(() => {
        if (!authLoading && (!user || userProfile?.role !== 'delivery')) {
            router.push('/');
        }
    }, [user, userProfile, authLoading, router]);
    
    const completedDeliveries = useMemo(() => {
        if (!deliveries) return [];
        return deliveries.filter(o => o.status === 'Entregado');
    }, [deliveries]);

    const driverReviews = useMemo(() => {
        if (!completedDeliveries) return [];
        return completedDeliveries.filter(o => o.deliveryRating);
    }, [completedDeliveries]);

    const stats = useMemo(() => {
        const totalRating = driverReviews.reduce((acc, review) => acc + (review.deliveryRating || 0), 0);
        const avgRating = driverReviews.length > 0 ? totalRating / driverReviews.length : 0;
        const totalDeliveries = completedDeliveries.length;
        const totalEarnings = completedDeliveries.reduce((acc, order) => acc + order.deliveryFee, 0);

        return {
            avgRating,
            totalDeliveries,
            totalEarnings
        };
    }, [driverReviews, completedDeliveries]);


    if (authLoading || deliveriesLoading || !user) {
        return (
            <div className="container mx-auto">
                <PageHeader title="Mis Estadísticas" description="Cargando tus métricas de rendimiento." />
                <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Skeleton className="h-28" />
                        <Skeleton className="h-28" />
                        <Skeleton className="h-28" />
                    </div>
                    <div className="grid gap-4 mt-8 lg:grid-cols-2">
                        <Skeleton className="h-96" />
                        <Skeleton className="h-96" />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto">
            <PageHeader title="Mis Estadísticas" description="Tu rendimiento y ganancias como repartidor." />

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ganancias Totales</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${stats.totalEarnings.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">de todas las entregas completadas</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Entregas Completadas</CardTitle>
                        <PackageCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalDeliveries}</div>
                        <p className="text-xs text-muted-foreground">entregas realizadas con éxito</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Calificación Promedio</CardTitle>
                        <Star className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.avgRating.toFixed(1)} / 5.0</div>
                         <p className="text-xs text-muted-foreground">de {driverReviews.length} reseñas</p>
                    </CardContent>
                </Card>
            </div>
             <div className="grid gap-6 mt-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Historial de Ganancias</CardTitle>
                        <CardDescription>Detalle de tus entregas completadas.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Tienda</TableHead>
                                    <TableHead className="text-right">Ganancia</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {completedDeliveries.length > 0 ? (
                                    completedDeliveries.map(delivery => (
                                        <TableRow key={delivery.id}>
                                            <TableCell>{format(delivery.createdAt, 'dd/MM/yy')}</TableCell>
                                            <TableCell className="font-medium">{delivery.storeName}</TableCell>
                                            <TableCell className="text-right font-bold text-green-500">+${delivery.deliveryFee.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
                                            Aún no has completado ninguna entrega.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <Card>
                     <CardHeader>
                        <CardTitle>Opiniones de Clientes</CardTitle>
                        <CardDescription>Lo que los clientes dicen de ti.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ReviewList reviews={driverReviews} />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
