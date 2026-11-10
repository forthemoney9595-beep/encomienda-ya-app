'use client';

import { useEffect } from 'react';
import { useRequireRole } from '@/hooks/use-require-role';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, query, where, orderBy } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StarRating } from '@/components/star-rating';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { publicName } from '@/lib/public-name';

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

  // ARQ-010: guard único + `ready` para no armar consultas antes de confirmar el rol.
  const { ready } = useRequireRole('delivery');

  const driverRef = useMemoFirebase(() => (firestore && user && ready ? doc(firestore, 'users', user.uid) : null), [firestore, user, ready]);
  const { data: driver } = useDoc<{ rating?: number; ratingCount?: number }>(driverRef);

  const reviewsQuery = useMemoFirebase(() => {
    if (!firestore || !user || !ready) return null;
    return query(collection(firestore, 'deliveryReviews'), where('driverId', '==', user.uid), orderBy('createdAt', 'desc'));
  }, [firestore, user, ready]);

  const { data: reviews, isLoading } = useCollection<DeliveryReview>(reviewsQuery);

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 py-2">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-card" />)}
      </div>
    );
  }

  const avg = driver?.rating || 0;
  const count = driver?.ratingCount || 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-20">
      <PageHeader title="Mis reseñas" description="Lo que los clientes opinan de tus entregas." />

      <section className="glass-strong flex items-center gap-4 rounded-card p-5" aria-label="Tu calificación" data-testid="driver-rating-summary">
        <span className="font-headline text-[3.25rem] font-extrabold leading-none tabular-nums">
          {count > 0 ? avg.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}
        </span>
        <div>
          <StarRating rating={Math.round(avg)} />
          <p className="mt-1 text-muted-foreground">{count} reseña{count === 1 ? '' : 's'}</p>
        </div>
      </section>

      {(!reviews || reviews.length === 0) ? (
        <div className="glass rounded-card px-5 py-10 text-center">
          <p className="text-muted-foreground">Todavía no tenés reseñas. Van a aparecer acá cuando un cliente califique una entrega.</p>
        </div>
      ) : (
        <ul className="glass divide-y divide-foreground/10 overflow-hidden rounded-card" aria-label="Reseñas">
          {reviews.map(review => (
            <li key={review.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{publicName(review.userName)}</p>
                <StarRating rating={review.rating} />
              </div>
              {review.createdAt?.seconds && (
                <p className="text-sm text-muted-foreground">{format(new Date(review.createdAt.seconds * 1000), "d MMM yyyy, HH:mm", { locale: es })}</p>
              )}
              {review.comment && <p className="mt-2 text-foreground">{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
