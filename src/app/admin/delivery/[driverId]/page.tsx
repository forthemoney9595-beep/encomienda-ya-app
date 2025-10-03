
'use client';

import { notFound, useParams } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getDeliveryPersonById } from '@/lib/data-service';
import { Car, Mail, Phone, Star, PackageCheck, Bot, TrendingUp, TrendingDown } from 'lucide-react';
import { getPlaceholderImage } from '@/lib/placeholder-images';
import { usePrototypeData } from '@/context/prototype-data-context';
import { useEffect, useState, useMemo } from 'react';
import type { DeliveryPersonnel } from '@/lib/placeholder-data';
import type { Order } from '@/lib/order-service';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';

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

// Simulación de un análisis de IA para un conductor específico
const simulateAiAnalysis = (reviews: Review[]) => {
  if (reviews.length < 2) {
      return {
          summary: 'No hay suficientes datos para generar un análisis detallado. Se necesitan más reseñas.',
          strengths: [],
          weaknesses: []
      }
  }

  const positiveKeywords = ['rápido', 'amable', 'excelente', 'bien', 'sonrisa', 'impecable', 'perfecto'];
  const negativeKeywords = ['tardó', 'lento', 'esperado', 'no encontraba', 'buscarlo', 'grosero', 'mal'];
  
  let positiveMentions = 0;
  let negativeMentions = 0;

  reviews.forEach(review => {
    const commentLower = review.review.toLowerCase();
    if (positiveKeywords.some(kw => commentLower.includes(kw))) {
      positiveMentions++;
    }
    if (negativeKeywords.some(kw => commentLower.includes(kw))) {
      negativeMentions++;
    }
  });

  const totalRating = reviews.reduce((acc, r) => acc + r.rating, 0);
  const avgRating = totalRating / reviews.length;

  let summary;
  if (avgRating > 4) {
      summary = `El análisis muestra un sentimiento predominantemente positivo. ${
          positiveMentions > 0 ? 'Frecuentemente elogiado por su amabilidad y rapidez.' : ''
      }`;
  } else if (avgRating < 3) {
      summary = `El análisis sugiere áreas de mejora. ${
          negativeMentions > 0 ? 'Los comentarios mencionan problemas con la navegación y la gestión del tiempo.' : ''
      }`;
  } else {
      summary = 'El sentimiento general es mixto, con una combinación de comentarios positivos y negativos.';
  }

  return {
    summary,
    strengths: [
      'Alta satisfacción del cliente (calificación promedio alta).',
      'Velocidad de entrega consistentemente valorada positivamente.',
    ].slice(0, Math.min(2, positiveMentions)),
    weaknesses: [
      'Dificultades ocasionales con la navegación a la dirección de entrega.',
      'Retrasos menores en algunas entregas.',
    ].slice(0, Math.min(2, negativeMentions))
  }
};


function DriverReviews({ reviews }: { reviews: Review[] }) {
    const [analysis, setAnalysis] = useState<any>(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(true);

    useEffect(() => {
        setLoadingAnalysis(true);
        const timer = setTimeout(() => {
            setAnalysis(simulateAiAnalysis(reviews));
            setLoadingAnalysis(false);
        }, 1500);
        return () => clearTimeout(timer);
    }, [reviews]);
    
    if (reviews.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-10">
                <p>Este repartidor aún no ha recibido ninguna reseña.</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Bot className="h-6 w-6 text-primary" />
                        Resumen de IA
                    </CardTitle>
                    <Badge variant={loadingAnalysis ? 'outline' : 'secondary'}>{loadingAnalysis ? 'Analizando...' : 'Completo'}</Badge>
                </CardHeader>
                <CardContent>
                    {loadingAnalysis ? (
                        <div className="space-y-4">
                            <Skeleton className="h-5 w-full" />
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </div>
                        </div>
                    ) : (
                         <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">{analysis.summary}</p>
                            {(analysis.strengths.length > 0 || analysis.weaknesses.length > 0) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {analysis.strengths.length > 0 && <Card className="bg-secondary/30">
                                        <CardHeader className="p-4">
                                            <CardTitle className="flex items-center text-base gap-2 text-green-500">
                                                <TrendingUp className="h-5 w-5" />
                                                Puntos Fuertes
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0">
                                            <ul className="list-disc pl-5 space-y-1 text-xs">
                                                {analysis.strengths.map((item: string, index: number) => <li key={index}>{item}</li>)}
                                            </ul>
                                        </CardContent>
                                    </Card>}
                                    {analysis.weaknesses.length > 0 && <Card className="bg-destructive/10">
                                        <CardHeader className="p-4">
                                            <CardTitle className="flex items-center text-base gap-2 text-destructive">
                                                <TrendingDown className="h-5 w-5" />
                                                Áreas de Mejora
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0">
                                            <ul className="list-disc pl-5 space-y-1 text-xs">
                                                {analysis.weaknesses.map((item: string, index: number) => <li key={index}>{item}</li>)}
                                            </ul>
                                        </CardContent>
                                    </Card>}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div>
                <h3 className="text-lg font-semibold mb-4">Comentarios de Clientes</h3>
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
            </div>
        </div>
    );
}


export default function DriverProfilePage() {
    const params = useParams();
    const driverId = params.driverId as string;
    
    const { getReviewsByDriverId, prototypeDelivery, prototypeOrders, loading: prototypeLoading } = usePrototypeData();
    const [driver, setDriver] = useState<DeliveryPersonnel | null>(null);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);

    const driverStats = useMemo(() => {
        const completedDeliveries = prototypeOrders.filter(o => o.deliveryPersonId === driverId && o.status === 'Entregado');
        const reviewedDeliveries = completedDeliveries.filter(o => o.deliveryRating);
        
        if (reviewedDeliveries.length === 0) {
            return {
                avgRating: 0,
                totalDeliveries: completedDeliveries.length
            }
        }
        
        const totalRating = reviewedDeliveries.reduce((sum, order) => sum + order.deliveryRating!, 0);
        
        return {
            avgRating: totalRating / reviewedDeliveries.length,
            totalDeliveries: completedDeliveries.length
        }
    }, [driverId, prototypeOrders]);

    useEffect(() => {
        async function fetchData() {
            if (prototypeLoading) return;
            setLoading(true);

            let driverData: DeliveryPersonnel | null = null;

            if (driverId === prototypeDelivery.id) {
                 driverData = prototypeDelivery;
            } else {
                 const realDriver = await getDeliveryPersonById(driverId);
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
    }, [driverId, prototypeDelivery, getReviewsByDriverId, prototypeLoading]);


    if (loading || prototypeLoading) {
        return (
            <div className="container mx-auto">
                <PageHeader title={<Skeleton className="h-8 w-48" />} description={<Skeleton className="h-5 w-64" />} />
                <div className="grid gap-8 md:grid-cols-3">
                    <div className="md:col-span-1">
                        <Skeleton className="h-[270px] w-full" />
                    </div>
                     <div className="md:col-span-2 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                           <Skeleton className="h-24 w-full" />
                           <Skeleton className="h-24 w-full" />
                        </div>
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
                <div className="md:col-span-1 space-y-6">
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
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Métricas de Rendimiento</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-muted">
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold">{driverStats.avgRating.toFixed(1)}</span>
                                    <Star className="h-4 w-4 text-amber-400" />
                                </div>
                                <p className="text-xs text-muted-foreground text-center">Calificación Promedio</p>
                            </div>
                             <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-muted">
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold">{driverStats.totalDeliveries}</span>
                                     <PackageCheck className="h-4 w-4 text-primary" />
                                </div>
                                <p className="text-xs text-muted-foreground text-center">Entregas Totales</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="md:col-span-2">
                    <DriverReviews reviews={reviews} />
                </div>
            </div>
        </div>
    );
}
