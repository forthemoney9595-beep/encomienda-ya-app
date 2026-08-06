'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import {
  collection, query, orderBy, where, limit, startAfter, getDocs, getCountFromServer, doc, getDoc,
  QueryDocumentSnapshot, Timestamp,
} from 'firebase/firestore';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { getOrderStatusKind, orderStatusBadgeClass } from '@/lib/order-status';
import { cn } from '@/lib/utils';
import { format, subDays, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Search, XCircle, ChevronLeft, ChevronRight, Loader2, ExternalLink, Download, DollarSign } from 'lucide-react';
import { downloadCsv } from '@/lib/csv-export';
import { logAdminAction } from '@/lib/admin-audit';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import type { Order } from '@/lib/order-service';

const PAGE_SIZE = 50;
// Los IDs de documento de Firestore tienen 20 caracteres; desde acá vale la pena intentar
// el getDoc directo en vez de gastar una lectura en cada tecla.
const ORDER_ID_MIN_LEN = 15;
const ALL_STATUSES = [
  'Pendiente de Confirmación', 'Pendiente de Pago', 'En preparación',
  'Listo para recoger', 'En camino', 'En reparto', 'Entregado', 'Cancelado', 'Rechazado',
];
const CANCELABLE_BY_ADMIN = new Set(['Pendiente de Confirmación','Pendiente de Pago','En preparación','Listo para recoger','En camino','En reparto']);

type DateFilter = '7d' | '30d' | 'month' | 'all';
const DATE_LABELS: Record<DateFilter, string> = { '7d': '7 días', '30d': '30 días', 'month': 'Este mes', 'all': 'Todo' };

function getDateFrom(f: DateFilter): Date | null {
  if (f === 'all') return null;
  if (f === '7d') return subDays(new Date(), 7);
  if (f === '30d') return subDays(new Date(), 30);
  return startOfMonth(new Date());
}

const formatDt = (ts: any) => {
  if (!ts) return '—';
  try { return format(ts.toDate ? ts.toDate() : new Date(ts), 'd MMM HH:mm', { locale: es }); } catch { return '—'; }
};

function AdminOrdersPage() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  // Las tarjetas del flujo en el dashboard enlazan acá con ?status=... -- así tocar
  // "Preparando" abre directamente la lista filtrada por ese estado. Se arranca en "Todo"
  // de fecha para que no se pierdan pedidos viejos de ese estado (justo los que importan).
  const searchParams = useSearchParams();
  const statusParam = searchParams.get('status');
  const [statusFilter, setStatusFilter] = useState<string>(statusParam || 'all');
  const [dateFilter, setDateFilter] = useState<DateFilter>(statusParam ? 'all' : '30d');
  const [search, setSearch] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);

  // Paginación con getDocs + cursor, igual que admin/users, reviews, incidents y finances.
  // ANTES usaba useCollection y leía `(order as any)._snap` para el startAfter -- campo que
  // el hook compartido NUNCA adjunta, así que el botón "Siguiente" no avanzaba nunca
  // (bug latente anotado en la Fase Z, confirmado y corregido acá).
  const [rows, setRows] = useState<any[]>([]);
  const [pageStack, setPageStack] = useState<QueryDocumentSnapshot[]>([]);
  const [lastSnap, setLastSnap] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Búsqueda por ID exacto: se resuelve con un getDoc directo, así encuentra CUALQUIER
  // pedido del histórico sin importar filtros ni página. Antes la búsqueda solo filtraba
  // en memoria los 50 documentos de la página cargada, así que buscar un pedido viejo por
  // ID no lo encontraba nunca. Firestore no sabe buscar por substring, y `orders` es una
  // colección sin techo: por eso nombre de cliente/tienda siguen filtrando en memoria
  // (sobre la página) y el ID va server-side.
  const [idResult, setIdResult] = useState<any | null>(null);
  const [idSearching, setIdSearching] = useState(false);

  // Total real que matchea los filtros actuales -- count() server-side, no baja documentos
  // (mismo criterio de la Fase Z). Sin esto la cabecera decía "50 pedidos", que se leía
  // como si esos fueran TODOS los pedidos y no la primera página.
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Reembolso
  const [refundOrder, setRefundOrder] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundOperationRef, setRefundOperationRef] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const dateFrom = useMemo(() => getDateFrom(dateFilter), [dateFilter]);

  const buildQuery = useCallback((cursor: QueryDocumentSnapshot | null) => {
    if (!firestore) return null;
    const constraints: any[] = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];
    if (statusFilter !== 'all') constraints.unshift(where('status', '==', statusFilter));
    if (dateFrom) constraints.unshift(where('createdAt', '>=', Timestamp.fromDate(dateFrom)));
    if (cursor) constraints.push(startAfter(cursor));
    return query(collection(firestore, 'orders'), ...constraints);
  }, [firestore, statusFilter, dateFrom]);

  const loadPage = useCallback(async (cursor: QueryDocumentSnapshot | null) => {
    const q = buildQuery(cursor);
    if (!q) return;
    setIsLoading(true);
    try {
      const snap = await getDocs(q);
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLastSnap(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e: any) {
      console.error('[admin/orders] Error cargando pedidos:', e);
      // Firestore devuelve 'failed-precondition' cuando falta un índice compuesto, e
      // incluye en el mensaje el link para crearlo. El toast genérico ("Error al cargar
      // pedidos") no decía nada y obligaba a abrir la consola para entender qué pasaba.
      const missingIndex = e?.code === 'failed-precondition';
      toast({
        variant: 'destructive',
        title: missingIndex ? 'Falta un índice de Firestore' : 'Error al cargar pedidos',
        description: missingIndex
          ? 'Esta combinación de filtros necesita un índice que todavía no está desplegado. El link para crearlo está en la consola del navegador.'
          : e?.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery, toast]);

  // Al cambiar de filtro se vuelve a la primera página (si no, el cursor viejo no aplica).
  useEffect(() => { setPageStack([]); loadPage(null); }, [loadPage]);

  // Total con los mismos filtros (sin limit ni cursor).
  useEffect(() => {
    if (!firestore) return;
    const cons: any[] = [];
    if (statusFilter !== 'all') cons.push(where('status', '==', statusFilter));
    if (dateFrom) cons.push(where('createdAt', '>=', Timestamp.fromDate(dateFrom)));
    let cancelled = false;
    getCountFromServer(query(collection(firestore, 'orders'), ...cons))
      .then(s => { if (!cancelled) setTotalCount(s.data().count); })
      .catch(() => { if (!cancelled) setTotalCount(null); });
    return () => { cancelled = true; };
  }, [firestore, statusFilter, dateFrom]);

  // Búsqueda por ID exacto contra toda la colección (getDoc directo, 1 lectura).
  useEffect(() => {
    const term = search.trim();
    if (!firestore || term.length < ORDER_ID_MIN_LEN) { setIdResult(null); return; }
    let cancelled = false;
    setIdSearching(true);
    getDoc(doc(firestore, 'orders', term))
      .then(s => { if (!cancelled) setIdResult(s.exists() ? { id: s.id, ...s.data() } : null); })
      .catch(() => { if (!cancelled) setIdResult(null); })
      .finally(() => { if (!cancelled) setIdSearching(false); });
    return () => { cancelled = true; };
  }, [firestore, search]);

  const orders = rows;

  const displayed = useMemo(() => {
    // Si el término es un ID que existe, se muestra ESE pedido aunque esté fuera del
    // filtro de fecha/estado o en otra página.
    if (idResult) return [idResult];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(o =>
      o.customerName?.toLowerCase().includes(q) ||
      o.storeName?.toLowerCase().includes(q) ||
      o.id?.toLowerCase().includes(q)
    );
  }, [rows, search, idResult]);

  const handleExportCsv = () => {
    const rows = displayed.map(o => ({
      'ID':           o.id,
      'Fecha':        formatDt(o.createdAt),
      'Cliente':      o.customerName || '',
      'Tienda':       (o as any).storeName || '',
      'Estado':       o.status,
      'Total':        o.total ?? 0,
      'Envío':        o.deliveryFee ?? 0,
      'Service Fee':  (o as any).serviceFee ?? 0,
      'Pago':         (o as any).paymentMethod || '',
    }));
    const now = format(new Date(), 'yyyy-MM-dd', { locale: es });
    downloadCsv(rows, `pedidos_${now}.csv`);
  };

  const handleNextPage = () => {
    if (!hasMore || !lastSnap) return;
    setPageStack(prev => [...prev, lastSnap]);
    loadPage(lastSnap);
  };

  const handlePrevPage = () => {
    if (pageStack.length === 0) return;
    const next = pageStack.slice(0, -1);
    setPageStack(next);
    loadPage(next.length > 0 ? next[next.length - 1] : null);
  };

  const pageIndex = pageStack.length;
  const rangeFrom = pageIndex * PAGE_SIZE + 1;
  const rangeTo = pageIndex * PAGE_SIZE + displayed.length;
  const totalPages = typeof totalCount === 'number' ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : 1;

  const handleCancel = async (orderId: string, orderUserId: string) => {
    if (!user) return;
    if (!confirm('¿Cancelar este pedido? Esta acción notificará al comprador y a la tienda.')) return;
    setCancelling(orderId);
    try {
      const res = await authedFetch('/api/orders/cancel', user, { orderId, userId: orderUserId });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      if (firestore) logAdminAction(firestore, user.uid, 'cancel_order', orderId);
      toast({ title: 'Pedido cancelado' });
      // Ya no hay listener en vivo (la lista es one-shot paginada): hay que recargar.
      loadPage(pageStack.length > 0 ? pageStack[pageStack.length - 1] : null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error al cancelar', description: e.message });
    } finally {
      setCancelling(null);
    }
  };

  const openRefund = (order: any) => {
    setRefundOrder(order);
    setRefundAmount(String(order.total || ''));
    setRefundReason('');
    setRefundOperationRef('');
  };

  const handleRefund = async () => {
    if (!user || !refundOrder) return;
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: 'destructive', title: 'Monto inválido' });
      return;
    }
    const opRef = refundOperationRef.trim();
    if (opRef.length < 4) {
      toast({ variant: 'destructive', title: 'Falta el número de operación', description: 'Es el comprobante de la devolución que ya hiciste en MercadoPago.' });
      return;
    }
    setSubmittingRefund(true);
    try {
      const res = await authedFetch('/api/admin/refund-order', user, {
        orderId: refundOrder.id, amount, reason: refundReason, operationRef: opRef,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      if (firestore) logAdminAction(firestore, user.uid, 'refund_order', refundOrder.id, `$${amount} · op ${opRef}${refundReason ? ' — ' + refundReason : ''}`);
      toast({ title: 'Reembolso registrado', description: `$${amount.toLocaleString()} devueltos al comprador.` });
      loadPage(pageStack.length > 0 ? pageStack[pageStack.length - 1] : null);
      setRefundOrder(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error al reembolsar', description: e.message });
    } finally {
      setSubmittingRefund(false);
    }
  };

  return (
    <div className="container mx-auto pb-20 space-y-6">
      <PageHeader title="Gestión de Pedidos" description="Todos los pedidos de la plataforma." />

      {/* Filtros */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 space-y-3">
          {/* Búsqueda */}
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pegá un ID de pedido, o filtrá por cliente/tienda..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
              {idSearching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {idResult && (
              <p className="text-xs text-success">
                Pedido encontrado por ID — se muestra aunque esté fuera de los filtros de fecha/estado.
              </p>
            )}
            {!idResult && search.trim().length >= ORDER_ID_MIN_LEN && !idSearching && (
              <p className="text-xs text-muted-foreground">
                No existe ningún pedido con ese ID. Cliente y tienda se filtran solo sobre esta página.
              </p>
            )}
          </div>

          {/* Fecha */}
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(DATE_LABELS) as DateFilter[]).map(d => (
              <button key={d} onClick={() => { setDateFilter(d); }}
                className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
                  dateFilter === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                )}>{DATE_LABELS[d]}</button>
            ))}
          </div>

          {/* Estado */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setStatusFilter("all"); }}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
                statusFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
              )}>Todos</button>
            {ALL_STATUSES.map(s => (
              <button key={s} onClick={() => { setStatusFilter(s); }}
                className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
                  statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                )}>{s}</button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabla de pedidos */}
      <Card className="shadow-md overflow-hidden">
        <CardHeader className="border-b py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {/* Antes decía solo "50 pedidos (página 1)", que se leía como si hubiera 50 en
                  total. Ahora muestra el rango que se está viendo Y el total real que
                  matchea los filtros (count server-side, no baja documentos). */}
              {isLoading ? 'Cargando...' : idResult ? '1 pedido (búsqueda por ID)' : (
                <>
                  Mostrando {rangeFrom}-{rangeTo}
                  {typeof totalCount === 'number' ? ` de ${totalCount}` : ''} pedido{totalCount === 1 ? '' : 's'}
                  {totalPages > 1 ? ` · página ${pageIndex + 1} de ${totalPages}` : ''}
                </>
              )}
            </CardTitle>
            {!isLoading && displayed.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1.5" onClick={handleExportCsv}>
                <Download className="h-3.5 w-3.5" /> Exportar CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tienda</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Estado</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </td></tr>
              )}
              {!isLoading && displayed.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No hay pedidos en este período.</td></tr>
              )}
              {displayed.map(order => {
                const kind = getOrderStatusKind(order.status);
                return (
                  <tr key={order.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDt(order.createdAt)}</td>
                    <td className="px-4 py-3 font-medium">{order.customerName || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(order as any).storeName || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold">${order.total?.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <Badge variant="outline" className={cn('text-[10px] uppercase', orderStatusBadgeClass[kind])}>
                          {order.status}
                        </Badge>
                        {(order as any).refunded && (
                          <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
                            Reembolsado ${((order as any).refundAmount || 0).toLocaleString()}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/orders/${order.id}`} target="_blank">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
                            <ExternalLink className="h-3 w-3" /> Ver
                          </Button>
                        </Link>
                        {(order as any).paymentStatus === 'paid' && !(order as any).refunded && (
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs text-warning hover:bg-warning/10 gap-1"
                            onClick={() => openRefund(order)}
                            title="Reembolsar"
                          >
                            <DollarSign className="h-3 w-3" /> Reembolsar
                          </Button>
                        )}
                        {CANCELABLE_BY_ADMIN.has(order.status) && (
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                            disabled={cancelling === order.id}
                            onClick={() => handleCancel(order.id, order.userId)}
                            title="Cancelar"
                          >
                            {cancelling === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Paginación */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <Button size="sm" variant="ghost" onClick={handlePrevPage} disabled={pageIndex === 0} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">Página {pageIndex + 1}</span>
          <Button size="sm" variant="ghost" onClick={handleNextPage} disabled={!orders || orders.length < PAGE_SIZE} className="gap-1">
            Siguiente <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Diálogo de reembolso */}
      <Dialog open={!!refundOrder} onOpenChange={(open) => { if (!open) setRefundOrder(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reembolsar pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-sm text-muted-foreground">
              Pedido de <strong>{refundOrder?.customerName}</strong> · Total ${refundOrder?.total?.toLocaleString()}
            </div>
            <div className="space-y-1.5">
              <Label>Monto a reembolsar</Label>
              <Input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder="Monto en ARS" />
            </div>
            <div className="space-y-1.5">
              <Label>Motivo <span className="text-muted-foreground">(lo verá el comprador)</span></Label>
              <Textarea value={refundReason} onChange={e => setRefundReason(e.target.value)} rows={2} placeholder="Ej: El pedido llegó incompleto." />
            </div>
            {/* Mismo criterio que aprobar un retiro: la devolución se hace por fuera, así que
                sin comprobante no hay con qué respaldarla si el comprador reclama. */}
            <div className="space-y-1.5">
              <Label>N° de operación de la devolución *</Label>
              <Input value={refundOperationRef} onChange={e => setRefundOperationRef(e.target.value)}
                placeholder="El que te da MercadoPago al devolver" />
            </div>
            <div className="rounded-lg bg-warning/10 border border-warning/30 p-2.5 text-[11px] text-foreground">
              <strong>Hacé primero la devolución en MercadoPago</strong> y después registrala acá con
              su número de operación. Esto no mueve plata: descuenta el monto del saldo de la
              tienda y del repartidor, y le avisa al comprador que ya se le devolvió.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRefundOrder(null)} disabled={submittingRefund}>Cancelar</Button>
            <Button onClick={handleRefund} disabled={submittingRefund || refundOperationRef.trim().length < 4} className="gap-1.5">
              {submittingRefund && <Loader2 className="h-4 w-4 animate-spin" />} Ya devolví — registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminOrdersPageGuarded() {
  return <AdminAuthGuard><AdminOrdersPage /></AdminAuthGuard>;
}
