'use client';

import { useState } from 'react';
import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { authedFetch } from '@/lib/authed-fetch';
import { logAdminAction } from '@/lib/admin-audit';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Star, Trash2, Search, Loader2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

const formatDate = (ts: any) => {
  if (!ts) return '—';
  try { return format(ts.toDate ? ts.toDate() : new Date(ts), "d MMM yyyy, HH:mm", { locale: es }); } catch { return '—'; }
};

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(s => (
        <Star key={s} className={cn('h-3.5 w-3.5', rating >= s ? 'fill-warning text-warning' : 'text-muted-foreground/30')} />
      ))}
    </div>
  );
}

function AdminReviewsPage() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const reviewsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'reviews'), orderBy('createdAt', 'desc'));
  }, [firestore]);

  const { data: reviews, isLoading } = useCollection<any>(reviewsQuery);

  const displayed = reviews?.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.userName?.toLowerCase().includes(q) ||
      r.storeName?.toLowerCase().includes(q) ||
      r.comment?.toLowerCase().includes(q)
    );
  }) ?? [];

  const handleDelete = async (reviewId: string, storeName: string) => {
    if (!user || !firestore) return;
    if (!confirm(`¿Eliminar esta reseña de "${storeName}"? Esta acción recalculará el rating de la tienda.`)) return;
    setDeleting(reviewId);
    try {
      const res = await authedFetch('/api/admin/delete-review', user, { reviewId });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');
      logAdminAction(firestore, user.uid, 'delete_review', reviewId, storeName);
      toast({ title: 'Reseña eliminada', description: 'El rating de la tienda fue recalculado.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader
        title="Moderación de Reseñas"
        description={`${reviews?.length ?? 0} reseñas en la plataforma.`}
      />

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por cliente, tienda o contenido..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {!isLoading && displayed.length === 0 && (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            No hay reseñas{search ? ' que coincidan con la búsqueda' : ' todavía'}.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {displayed.map(review => (
          <Card key={review.id} className="shadow-sm">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Stars rating={review.rating} />
                    <span className="text-xs font-semibold">{review.rating}/5</span>
                    <Badge variant="outline" className="text-[10px]">
                      {review.storeName || review.storeId?.slice(0,8) || 'Tienda'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                  </div>
                  <p className="text-sm font-medium">{review.userName}</p>
                  {review.comment && (
                    <p className="text-sm text-muted-foreground leading-relaxed">&ldquo;{review.comment}&rdquo;</p>
                  )}
                  {review.ownerReply && (
                    <div className="mt-2 pl-3 border-l-2 border-primary/30">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> Respuesta de la tienda:
                      </p>
                      <p className="text-xs text-muted-foreground italic">{review.ownerReply}</p>
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                  disabled={deleting === review.id}
                  onClick={() => handleDelete(review.id, review.storeName || 'esta tienda')}
                  title="Eliminar reseña"
                >
                  {deleting === review.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AdminReviewsPageGuarded() {
  return <AdminAuthGuard><AdminReviewsPage /></AdminAuthGuard>;
}
