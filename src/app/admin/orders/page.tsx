'use client';

import { useState, useMemo } from 'react';
import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, orderBy, where, limit, startAfter, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
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

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('30d');
  const [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<(QueryDocumentSnapshot | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [cancelling, setCancelling] = useState<string | null>(null);

  // Reembolso
  const [refundOrder, setRefundOrder] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const dateFrom = useMemo(() => getDateFrom(dateFilter), [dateFilter]);

  const ordersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    const constraints: any[] = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];
    if (statusFilter !== 'all') constraints.unshift(where('status', '==', statusFilter));
    if (dateFrom) constraints.unshift(where('createdAt', '>=', Timestamp.fromDate(dateFrom)));
    const cursor = cursors[pageIndex];
    if (cursor) constraints.push(startAfter(cursor));
    return query(collection(firestore, 'orders'), ...constraints);
  }, [firestore, statusFilter, dateFilter, pageIndex, cursors]);

  const { data: orders, isLoading } = useCollection<Order & { _snap?: any }>(ordersQuery);

  const displayed = useMemo(() => {
    if (!orders) return [];
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(o =>
      o.customerName?.toLowerCase().includes(q) ||
      o.storeName?.toLowerCase().includes(q) ||
      o.id?.toLowerCase().includes(q)
    );
  }, [orders, search]);

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
    if (!orders || orders.length < PAGE_SIZE) return;
    const lastDoc = (orders[orders.length - 1] as any)._snap;
    if (!lastDoc) return;
    setCursors(prev => {
      const next = [...prev];
      next[pageIndex + 1] = lastDoc;
      return next;
    });
    setPageIndex(p => p + 1);
  };

  const handlePrevPage = () => {
    if (pageIndex === 0) return;
    setPageIndex(p => p - 1);
  };

  const handleCancel = async (orderId: string, orderUserId: string) => {
    if (!user) return;
    if (!confirm('¿Cancelar este pedido? Esta acción notificará al comprador y a la tienda.')) return;
    setCancelling(orderId);
    try {
      const res = await authedFetch('/api/orders/cancel', user, { orderId, userId: orderUserId });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ title: 'Pedido cancelado' });
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
  };

  const handleRefund = async () => {
    if (!user || !refundOrder) return;
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: 'destructive', title: 'Monto inválido' });
      return;
    }
    setSubmittingRefund(true);
    try {
      const res = await authedFetch('/api/admin/refund-order', user, { orderId: refundOrder.id, amount, reason: refundReason });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      if (firestore) logAdminAction(firestore, user.uid, 'refund_order', refundOrder.id, `$${amount}${refundReason ? ' — ' + refundReason : ''}`);
      toast({ title: 'Reembolso registrado', description: `$${amount.toLocaleString()} — recordá hacer la devolución en MercadoPago.` });
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
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, tienda o ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Fecha */}
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(DATE_LABELS) as DateFilter[]).map(d => (
              <button key={d} onClick={() => { setDateFilter(d); setPageIndex(0); setCursors([null]); }}
                className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
                  dateFilter === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                )}>{DATE_LABELS[d]}</button>
            ))}
          </div>

          {/* Estado */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setStatusFilter('all'); setPageIndex(0); setCursors([null]); }}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
                statusFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
              )}>Todos</button>
            {ALL_STATUSES.map(s => (
              <button key={s} onClick={() => { setStatusFilter(s); setPageIndex(0); setCursors([null]); }}
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
              {isLoading ? 'Cargando...' : `${displayed.length} pedidos ${orders && orders.length >= PAGE_SIZE ? '(página ' + (pageIndex + 1) + ')' : ''}`}
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
            <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-2.5">
              Esto registra el reembolso y notifica al comprador. La devolución real del dinero
              la hacés vos desde MercadoPago (igual que las transferencias de retiros).
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRefundOrder(null)} disabled={submittingRefund}>Cancelar</Button>
            <Button onClick={handleRefund} disabled={submittingRefund} className="gap-1.5">
              {submittingRefund && <Loader2 className="h-4 w-4 animate-spin" />} Registrar reembolso
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
