'use client';

// Reclamos del comprador (Fase NN) -- la bandeja donde el admin los revisa y decide.
// Mismo molde que /admin/incidents (paginación getDocs+cursor, pestañas por resolved en
// memoria) más las tres salidas: Reembolsar (abre el diálogo de reembolso precargado y
// va por /api/admin/refund-order con claimId -- linkea reclamo↔reembolso y exige admin
// 'full'), Rechazar con motivo (le llega al comprador) y Resuelto por otra vía. Las dos
// últimas van por /api/claims/resolve (notifica + auditoría; cualquier nivel de admin).

import { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { authedFetch } from '@/lib/authed-fetch';
import { CLAIM_TYPES, type Claim, type ClaimType } from '@/lib/claim-types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Loader2, AlertTriangle, CheckCircle2, ExternalLink, ImageIcon, Wallet, XCircle, UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;
const money = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

const formatDate = (ts: any) => {
  if (!ts) return '—';
  try { return format(ts.toDate ? ts.toDate() : new Date(ts), "d MMM yyyy HH:mm", { locale: es }); } catch { return '—'; }
};

const RESOLUTION_LABELS: Record<string, string> = {
  refunded: 'Reembolsado',
  rejected: 'Rechazado',
  other: 'Resuelto por otra vía',
};

type DialogMode =
  | { kind: 'refund'; claim: Claim }
  | { kind: 'reject'; claim: Claim }
  | { kind: 'other'; claim: Claim }
  | null;

function AdminClaimsPage() {
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const isSupport = (userProfile as any)?.adminLevel === 'support';

  const [statusTab, setStatusTab] = useState<'pending' | 'resolved'>('pending');
  const [rows, setRows] = useState<Claim[]>([]);
  const [lastSnap, setLastSnap] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const buildQuery = useCallback((cursor: QueryDocumentSnapshot | null) => {
    if (!firestore) return null;
    const base = query(collection(firestore, 'claims'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    return cursor ? query(base, startAfter(cursor)) : base;
  }, [firestore]);

  const resetLoad = useCallback(async () => {
    const q = buildQuery(null);
    if (!q) return;
    setIsLoading(true);
    try {
      const snap = await getDocs(q);
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Claim));
      setLastSnap(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { resetLoad(); }, [resetLoad]);

  const loadMore = async () => {
    const q = buildQuery(lastSnap);
    if (!q || !lastSnap) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(q);
      setRows(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }) as Claim)]);
      setLastSnap(snap.docs[snap.docs.length - 1] || lastSnap);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const displayed = useMemo(
    () => rows.filter(r => (statusTab === 'pending' ? r.resolved !== true : r.resolved === true)),
    [rows, statusTab],
  );

  // --- Foto de evidencia (URL firmada de 5 min) ---
  const [loadingPhoto, setLoadingPhoto] = useState<string | null>(null);
  const viewPhoto = async (claim: Claim) => {
    if (!user) return;
    setLoadingPhoto(claim.id);
    try {
      const res = await authedFetch('/api/claims/photo-url', user, { claimId: claim.id });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
      else toast({ variant: 'destructive', title: 'No se pudo cargar la foto' });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo cargar la foto' });
    } finally {
      setLoadingPhoto(null);
    }
  };

  // --- Diálogos de resolución ---
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [note, setNote] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [operationRef, setOperationRef] = useState('');
  const [working, setWorking] = useState(false);

  const openDialog = (mode: NonNullable<DialogMode>) => {
    setNote(mode.kind === 'refund'
      ? `Reclamo: ${CLAIM_TYPES[mode.claim.type]?.label || mode.claim.type}`
      : '');
    setRefundAmount(String(mode.claim.suggestedAmount ?? mode.claim.orderTotal ?? ''));
    setOperationRef('');
    setDialog(mode);
  };

  const markResolvedLocally = (claimId: string, resolution: string, resolutionNote: string) => {
    setRows(prev => prev.map(r => r.id === claimId
      ? { ...r, resolved: true, resolution: resolution as any, resolutionNote } : r));
  };

  const handleConfirm = async () => {
    if (!dialog || !user) return;
    setWorking(true);
    try {
      if (dialog.kind === 'refund') {
        const res = await authedFetch('/api/admin/refund-order', user, {
          orderId: dialog.claim.orderId,
          amount: Number(refundAmount),
          reason: note.trim(),
          operationRef: operationRef.trim(),
          claimId: dialog.claim.id,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo registrar el reembolso.');
        toast({ title: '💸 Reembolso registrado', description: `Se devolvieron ${money(Number(refundAmount))} y el reclamo quedó resuelto.` });
        markResolvedLocally(dialog.claim.id, 'refunded', `Reembolso de ${money(Number(refundAmount))}`);
      } else {
        const res = await authedFetch('/api/claims/resolve', user, {
          claimId: dialog.claim.id,
          action: dialog.kind === 'reject' ? 'reject' : 'other',
          note: note.trim(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo resolver el reclamo.');
        toast({ title: dialog.kind === 'reject' ? 'Reclamo rechazado' : 'Reclamo resuelto', description: 'El comprador fue notificado.' });
        markResolvedLocally(dialog.claim.id, dialog.kind === 'reject' ? 'rejected' : 'other', note.trim());
      }
      setDialog(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader
        title="Reclamos de Compradores"
        description="Problemas reportados por los clientes sobre sus pedidos. Cada reclamo se resuelve con reembolso, rechazo con motivo, u otra vía."
      />

      <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as 'pending' | 'resolved')}>
        <TabsList>
          <TabsTrigger value="pending">Pendientes ({rows.filter(r => r.resolved !== true).length})</TabsTrigger>
          <TabsTrigger value="resolved">Resueltos ({rows.filter(r => r.resolved === true).length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {!isLoading && displayed.length === 0 && (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground space-y-2">
            <CheckCircle2 className="h-8 w-8 mx-auto opacity-30 text-success" />
            <p>{statusTab === 'pending' ? 'Sin reclamos pendientes.' : 'Todavía no hay reclamos resueltos.'}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && displayed.length > 0 && (
        <div className="space-y-3">
          {displayed.map((claim) => {
            const meta = CLAIM_TYPES[claim.type as ClaimType];
            return (
              <Card key={claim.id} className={cn('border-l-4',
                claim.resolved
                  ? (claim.resolution === 'rejected' ? 'border-l-muted-foreground' : 'border-l-success')
                  : (claim.type === 'not_received' || claim.type === 'stuck_order' ? 'border-l-destructive' : 'border-l-warning'))}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] gap-1 border-warning/40 text-warning">
                      <AlertTriangle className="h-3 w-3" /> {meta?.label || claim.type}
                    </Badge>
                    {claim.resolved && (
                      <Badge variant="outline" className={cn('text-[10px]',
                        claim.resolution === 'rejected' ? 'text-muted-foreground' : 'border-success/40 text-success')}>
                        {RESOLUTION_LABELS[claim.resolution || ''] || 'Resuelto'}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDate(claim.createdAt)}</span>
                    {typeof claim.suggestedAmount === 'number' && claim.suggestedAmount > 0 && (
                      <span className="ml-auto text-sm font-bold">{money(claim.suggestedAmount)}</span>
                    )}
                  </div>

                  <div className="text-sm space-y-1">
                    <p>
                      <strong>{claim.userName || 'Comprador'}</strong>
                      <span className="text-muted-foreground"> — {claim.storeName || 'Tienda desconocida'} · pedido de {money(claim.orderTotal || 0)}</span>
                    </p>
                    {/* Antifraude: historial del comprador a la vista, sin bloqueo automático */}
                    <p className={cn('text-xs flex items-center gap-1',
                      (claim.previousClaims || 0) >= 2 ? 'text-warning' : 'text-muted-foreground')}>
                      <UserRound className="h-3 w-3" />
                      {claim.previousClaims
                        ? `Reclamo n.º ${claim.previousClaims + 1} de este comprador · ${claim.previousRefunded || 0} terminaron en reembolso`
                        : 'Primer reclamo de este comprador'}
                    </p>
                    {claim.items?.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Productos: {claim.items.map(it => `${it.name} ×${it.quantity}`).join(', ')}
                      </p>
                    )}
                    <blockquote className="border-l-2 pl-3 text-muted-foreground italic">{claim.description}</blockquote>
                    {claim.resolved && claim.resolutionNote && (
                      <p className="text-xs text-muted-foreground">Resolución: {claim.resolutionNote}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/orders/${claim.orderId}`} target="_blank">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ver pedido
                      </Link>
                    </Button>
                    {claim.photoPath && (
                      <Button variant="outline" size="sm" onClick={() => viewPhoto(claim)} disabled={loadingPhoto === claim.id}>
                        {loadingPhoto === claim.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <><ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Ver foto</>}
                      </Button>
                    )}
                    {claim.resolved !== true && (
                      <div className="flex items-center gap-2 ml-auto">
                        {!isSupport && (
                          <Button size="sm" onClick={() => openDialog({ kind: 'refund', claim })}>
                            <Wallet className="h-3.5 w-3.5 mr-1.5" /> Reembolsar
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => openDialog({ kind: 'other', claim })}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Otra vía
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                          onClick={() => openDialog({ kind: 'reject', claim })}>
                          <XCircle className="h-3.5 w-3.5 mr-1.5" /> Rechazar
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {hasMore && !isLoading && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Cargar más
          </Button>
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          {dialog?.kind === 'refund' && (
            <>
              <DialogHeader>
                <DialogTitle>Reembolsar reclamo</DialogTitle>
                <DialogDescription>
                  Primero hacé la devolución en MercadoPago; después registrala acá con el número
                  de operación. El reclamo queda resuelto y el comprador es notificado.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="refund-amount">Monto a devolver</Label>
                  <Input id="refund-amount" type="number" value={refundAmount}
                    onChange={e => setRefundAmount(e.target.value)} />
                  {typeof dialog.claim.suggestedAmount === 'number' && (
                    <p className="text-xs text-muted-foreground">
                      Sugerido por el reclamo: {money(dialog.claim.suggestedAmount)} · total del pedido: {money(dialog.claim.orderTotal || 0)}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="refund-reason">Motivo (lo ve el comprador)</Label>
                  <Textarea id="refund-reason" value={note} onChange={e => setNote(e.target.value)} rows={2} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="refund-op">N.º de operación de MercadoPago <span className="text-destructive">*</span></Label>
                  <Input id="refund-op" value={operationRef} onChange={e => setOperationRef(e.target.value)}
                    placeholder="Comprobante de la devolución" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)} disabled={working}>Cancelar</Button>
                <Button onClick={handleConfirm}
                  disabled={working || operationRef.trim().length < 4 || !Number(refundAmount)}>
                  {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Registrar reembolso
                </Button>
              </DialogFooter>
            </>
          )}
          {(dialog?.kind === 'reject' || dialog?.kind === 'other') && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.kind === 'reject' ? 'Rechazar reclamo' : 'Resolver por otra vía'}</DialogTitle>
                <DialogDescription>
                  {dialog.kind === 'reject'
                    ? 'Explicá el motivo: es exactamente lo que va a leer el comprador en la notificación.'
                    : 'Anotá cómo se resolvió (por chat, la tienda repuso el producto, etc.). El comprador recibe esta nota.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="resolve-note">{dialog.kind === 'reject' ? 'Motivo del rechazo' : 'Cómo se resolvió'} <span className="text-destructive">*</span></Label>
                <Textarea id="resolve-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)} disabled={working}>Cancelar</Button>
                <Button variant={dialog.kind === 'reject' ? 'destructive' : 'default'}
                  onClick={handleConfirm} disabled={working || note.trim().length < 4}>
                  {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {dialog.kind === 'reject' ? 'Rechazar y notificar' : 'Marcar resuelto'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminClaimsPageGuarded() {
  return <AdminAuthGuard><AdminClaimsPage /></AdminAuthGuard>;
}
