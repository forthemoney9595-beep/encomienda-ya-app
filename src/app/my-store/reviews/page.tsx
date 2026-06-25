'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, query, where, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, MessageSquare } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Review {
  id: string;
  userName: string;
  rating: number;
  comment?: string;
  ownerReply?: string;
  createdAt?: any;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <Star key={star} className={`h-4 w-4 ${rating >= star ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`} />
      ))}
    </div>
  );
}

function ReviewReplyForm({ review, storeId }: { review: Review; storeId: string }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [reply, setReply] = useState(review.ownerReply || '');
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!firestore || !reply.trim()) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(firestore, 'reviews', review.id), {
        ownerReply: reply.trim(),
        ownerReplyAt: serverTimestamp(),
      });
      toast({ title: 'Respuesta guardada' });
      setIsOpen(false);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la respuesta.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (review.ownerReply && !isOpen) {
    return (
      <div className="mt-3 bg-muted/30 border-l-2 border-primary/40 rounded-r-md p-3">
        <p className="text-xs font-semibold text-primary mb-1">Tu respuesta</p>
        <p className="text-sm text-muted-foreground">{review.ownerReply}</p>
        <Button variant="link" size="sm" className="h-auto p-0 mt-1" onClick={() => setIsOpen(true)}>Editar</Button>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setIsOpen(true)}>
        <MessageSquare className="mr-2 h-4 w-4" /> Responder
      </Button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Respondé a esta reseña..." />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={isSaving || !reply.trim()}>Guardar</Button>
        <Button size="sm" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
      </div>
    </div>
  );
}

export default function StoreReviewsPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'store')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  const storeId = userProfile?.storeId;

  const storeRef = useMemoFirebase(() => (firestore && storeId ? doc(firestore, 'stores', storeId) : null), [firestore, storeId]);
  const { data: store } = useDoc<{ rating?: number; ratingCount?: number }>(storeRef);

  const reviewsQuery = useMemoFirebase(() => {
    if (!firestore || !storeId) return null;
    return query(collection(firestore, 'reviews'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));
  }, [firestore, storeId]);

  const { data: reviews, isLoading } = useCollection<Review>(reviewsQuery);

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
      <PageHeader title="Reseñas de mi tienda" description="Lo que tus clientes opinan después de recibir su pedido." />

      <Card>
        <CardContent className="flex items-center gap-4 py-5">
          <div className="text-3xl font-bold text-warning">{(store?.rating || 0).toFixed(1)}</div>
          <div>
            <Stars rating={Math.round(store?.rating || 0)} />
            <p className="text-sm text-muted-foreground mt-1">{store?.ratingCount || 0} reseña{store?.ratingCount === 1 ? '' : 's'}</p>
          </div>
        </CardContent>
      </Card>

      {(!reviews || reviews.length === 0) ? (
        <div className="text-center py-12 bg-muted/10 rounded-lg border border-dashed">
          <p className="text-muted-foreground">Todavía no tenés reseñas. Aparecerán acá cuando un cliente califique un pedido entregado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map(review => (
            <Card key={review.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{review.userName}</CardTitle>
                  <Stars rating={review.rating} />
                </div>
                {review.createdAt?.seconds && (
                  <p className="text-xs text-muted-foreground">{format(new Date(review.createdAt.seconds * 1000), "d MMM yyyy, HH:mm", { locale: es })}</p>
                )}
              </CardHeader>
              <CardContent>
                {review.comment && <p className="text-sm text-foreground">{review.comment}</p>}
                {storeId && <ReviewReplyForm review={review} storeId={storeId} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
