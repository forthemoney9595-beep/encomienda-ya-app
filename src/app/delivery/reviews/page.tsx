'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, query, where, orderBy } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StarRating } from '@/components/star-rating';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DeliveryReview {
  id: string;
  userName: string;
  rating: number;
  comment?: string;
  createdAt?: any;
}

export default function DeliveryReviewsPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'delivery')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  const driverRef = useMemoFirebase(() => (firestore && user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: driver } = useDoc<{ rating?: number; ratingCount?: number }>(driverRef);

  const reviewsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'deliveryReviews'), where('driverId', '==', user.uid), orderBy('createdAt', 'desc'));
  }, [firestore, user]);

  const { data: reviews, isLoading } = useCollection<DeliveryReview>(reviewsQuery);

  if (authLoading || isLoading) {
    return (
      <div className="container mx-auto space-y-4 py-6">
        <Skeleton className="h-10 w-64" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 pb-20">
      <PageHeader title="Mis reseñas" description="Lo que los clientes opinan de tus entregas." />

      <Card>
        <CardContent className="flex items-center gap-4 py-5">
          <div className="text-3xl font-bold text-warning">{(driver?.rating || 0).toFixed(1)}</div>
          <div>
            <StarRating rating={Math.round(driver?.rating || 0)} />
            <p className="text-sm text-muted-foreground mt-1">{driver?.ratingCount || 0} reseña{driver?.ratingCount === 1 ? '' : 's'}</p>
          </div>
        </CardContent>
      </Card>

      {(!reviews || reviews.length === 0) ? (
        <div className="text-center py-12 bg-muted/10 rounded-lg border border-dashed">
          <p className="text-muted-foreground">Todavía no tenés reseñas. Aparecerán acá cuando un cliente califique una entrega.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map(review => (
            <Card key={review.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{review.userName}</CardTitle>
                  <StarRating rating={review.rating} />
                </div>
                {review.createdAt?.seconds && (
                  <p className="text-xs text-muted-foreground">{format(new Date(review.createdAt.seconds * 1000), "d MMM yyyy, HH:mm", { locale: es })}</p>
                )}
              </CardHeader>
              {review.comment && (
                <CardContent>
                  <p className="text-sm text-foreground">{review.comment}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
