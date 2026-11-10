'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminAuthGuard from '../admin-auth-guard';
import { Button } from '@/components/ui/button';
import { AdminPage } from '@/components/admin/admin-page';
import { GlassSearch, ListCard, ListRow, SlidingChips } from '@/components/admin/admin-list';
import { EmptyState } from '@/components/admin/empty-state';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { useAuth } from '@/context/auth-context';
import { useFirestore, useMemoFirebase } from '@/lib/firebase';
import { useCountFromServer } from '@/lib/firebase-aggregate';
import { collection, query, where, orderBy, limit, startAfter, getDocs, type QueryDocumentSnapshot } from 'firebase/firestore';
import { authedFetch } from '@/lib/authed-fetch';
import { logAdminAction } from '@/lib/admin-audit';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Star, Trash2, Loader2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { publicName } from '@/lib/public-name';

const formatDate = (ts: any) => {
  if (!ts) return '—';
  try { return format(ts.toDate ? ts.toDate() : new Date(ts), "d MMM yyyy, HH:mm", { locale: es }); } catch { return '—'; }
};

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(s => (
        <Star key={s} aria-hidden="true" className={cn('h-3.5 w-3.5', rating >= s ? 'fill-warning text-warning' : 'text-muted-foreground/30')} />
      ))}
    </div>
  );
}

const PAGE_SIZE = 25;

// Filtro por rating SERVER-SIDE: sin esto, aislar las reseñas de 1-2 estrellas (las que de
// verdad hay que moderar) solo funcionaba sobre la página ya cargada, así que una crítica
// vieja no aparecía nunca. Usa `in` (igualdades) en vez de `<=` para poder combinar con
// orderBy('createdAt') -- una desigualdad obligaría a ordenar primero por rating.
type RatingFilter = 'all' | 'bad' | 'mid' | 'good';
const RATING_FILTERS: { k: RatingFilter; label: string; values: number[] | null }[] = [
  { k: 'all',  label: 'Todas',      values: null },
  { k: 'bad',  label: '1-2 ★',      values: [1, 2] },
  { k: 'mid',  label: '3 ★',        values: [3] },
  { k: 'good', label: '4-5 ★',      values: [4, 5] },
];

function AdminReviewsPage() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const confirmDialog = useConfirm();
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  const [rows, setRows] = useState<any[]>([]);
  const [lastSnap, setLastSnap] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const totalQ = useMemoFirebase(() => firestore ? collection(firestore, 'reviews') : null, [firestore]);
  const { count: totalReviews, refresh: refreshTotal } = useCountFromServer(totalQ, { refreshOnFocus: true });

  // Cuántas críticas hay en total (no solo en la página) -- es el número que le importa a
  // quien modera, y se calcula server-side sin bajar documentos.
  const badQ = useMemoFirebase(
    () => firestore ? query(collection(firestore, 'reviews'), where('rating', 'in', [1, 2])) : null,
    [firestore],
  );
  const { count: badCount, refresh: refreshBad } = useCountFromServer(badQ, { refreshOnFocus: true });

  const buildQuery = useCallback((cursor: QueryDocumentSnapshot | null) => {
    if (!firestore) return null;
    const values = RATING_FILTERS.find(f => f.k === ratingFilter)?.values;
    const cons: any[] = [];
    if (values) cons.push(where('rating', 'in', values));
    cons.push(orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    if (cursor) cons.push(startAfter(cursor));
    return query(collection(firestore, 'reviews'), ...cons);
  }, [firestore, ratingFilter]);

  const resetLoad = useCallback(async () => {
    const q = buildQuery(null);
    if (!q) return;
    setIsLoading(true);
    try {
      const snap = await getDocs(q);
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLastSnap(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) { console.error(e); toast({ variant: 'destructive', title: 'Error al cargar reseñas' }); }
    finally { setIsLoading(false); }
  }, [buildQuery, toast]);

  useEffect(() => { resetLoad(); }, [resetLoad]);

  const loadMore = async () => {
    const q = buildQuery(lastSnap);
    if (!q || !lastSnap) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(q);
      setRows(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      setLastSnap(snap.docs[snap.docs.length - 1] || lastSnap);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) { console.error(e); }
    finally { setLoadingMore(false); }
  };

  // Búsqueda por substring (cliente): Firestore no la hace server-side. Filtra sobre las reseñas
  // ya cargadas (las páginas traídas), no sobre toda la colección.
  const displayed = rows.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.userName?.toLowerCase().includes(q) ||
      r.storeName?.toLowerCase().includes(q) ||
      r.comment?.toLowerCase().includes(q)
    );
  });

  const handleDelete = async (reviewId: string, storeName: string) => {
    if (!user || !firestore) return;
    if (!(await confirmDialog({ title: `¿Eliminar esta reseña de "${storeName}"?`, description: 'Se recalcula el rating de la tienda. No se puede deshacer.', tone: 'destructive', confirmLabel: 'Eliminar reseña' })).ok) return;
    setDeleting(reviewId);
    try {
      const res = await authedFetch('/api/admin/delete-review', user, { reviewId });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');
      logAdminAction(firestore, user.uid, 'delete_review', reviewId, storeName);
      toast({ title: 'Reseña eliminada', description: 'El rating de la tienda fue recalculado.' });
      resetLoad();
      refreshTotal();
      refreshBad();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AdminPage
      title="Reseñas"
      subtitle={<span><b className="tabular-nums text-foreground">{totalReviews === null ? '…' : (totalReviews ?? 0).toLocaleString('es-AR')}</b> reseñas en la plataforma · moderación</span>}
    >
      {/* Aviso de críticas pendientes: lo primero que quiere ver quien modera. */}
      {(badCount ?? 0) > 0 && ratingFilter !== 'bad' && (
        <button
          type="button"
          onClick={() => setRatingFilter('bad')}
          className="glass flex min-h-[52px] w-full items-center justify-between gap-3 rounded-card border-destructive/40 p-4 text-left transition-colors hover:bg-destructive/10"
          data-testid="bad-reviews-alert"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-destructive-ink">
            <Star className="h-4 w-4 fill-current" aria-hidden="true" />
            {badCount} reseña{badCount === 1 ? '' : 's'} de 1-2 estrellas
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">Ver solo esas →</span>
        </button>
      )}

      <div className="space-y-3">
        <GlassSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar por cliente, tienda o contenido"
          label="Buscar reseñas"
          testId="reviews-search"
          hint="Busca solo en las reseñas ya cargadas (Firestore no busca texto). El filtro por estrellas sí abarca toda la base."
        />
        <SlidingChips
          chips={RATING_FILTERS.map(f => ({ value: f.k, label: f.label, ...(f.k === 'bad' ? { count: badCount ?? null } : f.k === 'all' ? { count: totalReviews ?? null } : {}) }))}
          value={ratingFilter}
          onChange={setRatingFilter}
          label="Filtrar reseñas por estrellas"
          testId="reviews-chips"
        />
      </div>

      <ListCard testId="reviews-list">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando reseñas" /></div>
        ) : displayed.length === 0 ? (
          <EmptyState icon={Star} title={`No hay reseñas${search ? ' que coincidan con la búsqueda' : ' todavía'}`} />
        ) : displayed.map((review, i) => (
          <ListRow
            key={review.id}
            index={i}
            testId="review-row"
            className="items-start"
            highlight={review.rating <= 2 ? 'destructive' : undefined}
            leading={
              <span className={cn('mt-0.5 grid h-[2.25rem] w-[2.25rem] shrink-0 place-items-center rounded-[0.75rem] text-sm font-bold tabular-nums', review.rating <= 2 ? 'bg-destructive/15 text-[hsl(0_75%_36%)] dark:text-destructive-ink' : 'bg-warning/15 text-warning-ink')} aria-label={`${review.rating} de 5 estrellas`}>
                {review.rating}★
              </span>
            }
            title={publicName(review.userName)}
            subtitle={
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Stars rating={review.rating} />
                <span className="font-medium text-foreground">{review.storeName || review.storeId?.slice(0, 8) || 'Tienda'}</span>
                <span>· {formatDate(review.createdAt)}</span>
              </span>
            }
            actions={
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive-ink"
                disabled={deleting === review.id}
                onClick={() => handleDelete(review.id, review.storeName || 'esta tienda')}
                title="Eliminar reseña"
                aria-label={`Eliminar reseña de ${publicName(review.userName)}`}
              >
                {deleting === review.id
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Trash2 className="h-4 w-4" aria-hidden="true" />}
              </Button>
            }
          >
            {review.comment && (
              <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">&ldquo;{review.comment}&rdquo;</p>
            )}
            {review.ownerReply && (
              <div className="mt-2 border-l-2 border-primary/40 pl-3">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3" aria-hidden="true" /> Respuesta de la tienda:
                </p>
                <p className="text-xs italic text-muted-foreground">{review.ownerReply}</p>
              </div>
            )}
          </ListRow>
        ))}
      </ListCard>

      {hasMore && !search.trim() && (
        <div className="flex justify-center">
          <Button variant="outline" className="min-h-[44px]" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Cargando…</> : 'Cargar más'}
          </Button>
        </div>
      )}
    </AdminPage>
  );
}

export default function AdminReviewsPageGuarded() {
  return <AdminAuthGuard><AdminReviewsPage /></AdminAuthGuard>;
}
