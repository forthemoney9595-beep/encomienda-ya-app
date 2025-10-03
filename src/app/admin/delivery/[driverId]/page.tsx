
'use client';

import { notFound, useParams } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getDeliveryPersonById } from '@/lib/data-service';
import { Car, Mail, Phone, Star } from 'lucide-react';
import { getPlaceholderImage } from '@/lib/placeholder-images';
import { usePrototypeData } from '@/context/prototype-data-context';
import { useEffect, useState } from 'react';
import type { DeliveryPersonnel, Order } from '@/lib/placeholder-data';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useFirestore } from '@/firebase';

function getStatusVariant(status: string) {
    switch (status) {
        case 'Activo': return 'secondary';
        case 'Pendiente': return 'default';
        case 'Inactivo':
        case 'Rechazado': return 'destructive';
        default: return 'outline';
    }
}

type Review = {
    orderId: string;
    rating: number;
    review: string;
    date: Date;
    customerName: string;
};

function DriverReviews({ reviews }: { reviews: Review[] }) {
    if (reviews.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-10">
                <p>Este repartidor aún no ha recibido ninguna reseña.</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            {reviews.map(review => (
                <Card key={review.orderId}>
                    <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-semibold">{review.customerName}</p>
                                <p className="text-sm text-muted-foreground">{format(review.date, "d 'de' MMMM, yyyy", { locale: es })}</p>
                            </div>
                             <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <Star key={star} className={cn('h-4 w-4', review.rating >= star ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30')} />
                                ))}
                            </div>
                        </div>
                        {review.review && (
                             <blockquote className="mt-3 border-l-2 pl-4 italic text-muted-foreground">
                                "{review.review}"
                            </blockquote>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}


export default function DriverProfilePage() {
    const params = useParams();
    const driverId = params.driverId as string;
    const db = useFirestore();
    
    const { getReviewsByDriverId, prototypeDelivery, loading: prototypeLoading } = usePrototypeData();
    const [driver, setDriver] = useState<DeliveryPersonnel | null>(null);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            if (prototypeLoading) return;
            setLoading(true);

            let driverData: DeliveryPersonnel | null = null;

            if (driverId === prototypeDelivery.id) {
                 driverData = prototypeDelivery;
            } else {
                 const realDriver = await getDeliveryPersonById(db, driverId);
                 if(realDriver) driverData = realDriver;
            }

            if (!driverData) {
                notFound();
                return;
            }
            
            setDriver(driverData);
            const fetchedReviews = getReviewsByDriverId(driverId);
            setReviews(fetchedReviews.map(order => ({
                orderId: order.id,
                rating: order.deliveryRating!,
                review: order.deliveryReview || '',
                date: order.createdAt,
                customerName: order.customerName,
            })));

            setLoading(false);
        }
        fetchData();
    }, [driverId, prototypeDelivery, getReviewsByDriverId, prototypeLoading, db]);


    if (loading || prototypeLoading) {
        return (
            <div className="container mx-auto">
                <PageHeader title={<Skeleton className="h-8 w-48" />} description={<Skeleton className="h-5 w-64" />} />
                <div className="grid gap-8 md:grid-cols-3">
                    <div className="md:col-span-1">
                        <Skeleton className="h-64 w-full" />
                    </div>
                     <div className="md:col-span-2">
                        <Skeleton className="h-80 w-full" />
                    </div>
                </div>
            </div>
        )
    }

    if (!driver) {
        return notFound();
    }

    return (
        <div className="container mx-auto">
            <PageHeader title={`Perfil de ${driver.name}`} description="Ver detalles y el historial de reseñas del conductor." />

            <div className="grid gap-8 md:grid-cols-3">
                <div className="md:col-span-1">
                    <Card>
                        <CardHeader className="items-center text-center">
                            <Avatar className="h-24 w-24 mb-4 border-2 border-primary">
                                <AvatarImage src={getPlaceholderImage(driver.id, 128, 128)} alt={driver.name} />
                                <AvatarFallback className="text-3xl">{driver.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <CardTitle className="text-2xl">{driver.name}</CardTitle>
                            <Badge variant={getStatusVariant(driver.status)} className="mt-1">{driver.status}</Badge>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3 text-sm">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span>{driver.email}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <span>(123) 456-7890 (simulado)</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Car className="h-4 w-4 text-muted-foreground" />
                                <span className="capitalize">{driver.vehicle}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="md:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Historial de Reseñas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DriverReviews reviews={reviews} />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
