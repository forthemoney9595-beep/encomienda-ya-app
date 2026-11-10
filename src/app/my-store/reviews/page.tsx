'use client';

import { useEffect, useState } from 'react';
import { useRequireRole } from '@/hooks/use-require-role';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, query, where, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare } from 'lucide-react';
import { StarRating } from '@/components/star-rating';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { publicName } from '@/lib/public-name';

interface Review {
  id: string;
  userName: string;
  rating: number;
  comment?: string;
  ownerReply?: string;
  createdAt?: any;
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
      <div className="mt-3 rounded-2xl bg-primary/[0.07] p-3 ring-1 ring-primary/20">
        <p className="mb-1 text-sm font-bold text-primary">Tu respuesta</p>
        <p className="text-sm text-muted-foreground">{review.ownerReply}</p>
        <Button variant="link" className="mt-1 h-11 px-0" onClick={() => setIsOpen(true)}>Editar</Button>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <Button variant="outline" className="mt-3 h-11 rounded-full bg-transparent px-5" onClick={() => setIsOpen(true)}>
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

  // ARQ-010: guard único + `ready` para no armar consultas antes de confirmar el rol.
  const { ready } = useRequireRole('store');

  const storeId = userProfile?.storeId;

  const storeRef = useMemoFirebase(() => (firestore && storeId && ready ? doc(firestore, 'stores', storeId) : null), [firestore, storeId]);
  const { data: store } = useDoc<{ rating?: number; ratingCount?: number }>(storeRef);

  const reviewsQuery = useMemoFirebase(() => {
    if (!firestore || !storeId || !ready) return null;
    return query(collection(firestore, 'reviews'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'));
  }, [firestore, storeId, ready]);

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
        <CardContent className="flex items-center gap-4 p-5">
          <div className="font-headline text-6xl font-extrabold leading-none text-warning tabular-nums">{(store?.rating || 0).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
          <div>
            <StarRating rating={Math.round(store?.rating || 0)} />
            <p className="text-sm text-muted-foreground mt-1">{store?.ratingCount || 0} reseña{store?.ratingCount === 1 ? '' : 's'}</p>
          </div>
        </CardContent>
      </Card>

      {(!reviews || reviews.length === 0) ? (
        <div className="glass rounded-card px-4 py-12 text-center">
          <p className="text-muted-foreground">Todavía no tenés reseñas. Aparecerán acá cuando un cliente califique un pedido entregado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map(review => (
            <Card key={review.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-headline text-xl font-extrabold">{publicName(review.userName)}</CardTitle>
                  <StarRating rating={review.rating} />
                </div>
                {review.createdAt?.seconds && (
                  <p className="text-sm text-muted-foreground">{format(new Date(review.createdAt.seconds * 1000), "d MMM yyyy, HH:mm", { locale: es })}</p>
                )}
              </CardHeader>
              <CardContent>
                {review.comment && <p className="text-base text-foreground">{review.comment}</p>}
                {storeId && <ReviewReplyForm review={review} storeId={storeId} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
