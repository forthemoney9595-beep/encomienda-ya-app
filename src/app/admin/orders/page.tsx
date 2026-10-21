'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, startAfter, sum, Timestamp, where,
  type Query, type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { subDays, startOfMonth } from 'date-fns';
import { ExternalLink, FileText, Undo2, XCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { useAggregate } from '@/lib/firebase-aggregate';
import { authedFetch } from '@/lib/authed-fetch';
import { logAdminAction } from '@/lib/admin-audit';
import { money } from '@/lib/format-money';
import { fmtDate } from '@/lib/format-date';
import { useToast } from '@/hooks/use-toast';
import type { Order } from '@/lib/order-service';
import { AdminPage } from '@/components/admin/admin-page';
import { KpiCard, KpiRow } from '@/components/admin/kpi-card';
import { FilterBar, type DateRangePreset, type FilterChip } from '@/components/admin/filter-bar';
import { DataTable, type CsvRow, type DataColumn, type RowAction } from '@/components/admin/data-table';
import { usePagedQuery } from '@/components/admin/use-paged-query';
import { StatusBadge } from '@/components/admin/status-badge';
import { EntityLink } from '@/components/admin/entity-link';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { RefundDialog } from '@/components/admin/refund-dialog';
import { useAdminCounts } from '@/components/admin/use-admin-counts';
import { useMemoFirebase } from '@/lib/firebase';

const PAGE_SIZE = 50;
const ORDER_ID_MIN_LEN = 15; // los IDs de Firestore tienen 20 chars; desde acá vale intentar el getDoc
const ALL_STATUSES = [
  'Pendiente de Confirmación', 'Pendiente de Pago', 'En preparación',
  'Listo para recoger', 'En camino', 'En reparto', 'Entregado', 'Cancelado', 'Rechazado',
];
const CANCELABLE_BY_ADMIN = new Set(['Pendiente de Confirmación', 'Pendiente de Pago', 'En preparación', 'Listo para recoger', 'En camino', 'En reparto']);
const PAYMENT_OPTIONS = [
  { value: 'paid', label: 'Pagado' },
  { value: 'pending_payment', label: 'Sin pagar' },
  { value: 'reversed', label: 'Revertido' },
];

type OrderRow = Order & {
  storeId?: string; storeName?: string; paymentStatus?: string; hasPaymentIssue?: boolean; hasClaim?: boolean;
  subtotal?: number; commissionRate?: number; commissionAmount?: number; refunded?: boolean; refundAmount?: number;
};

function dateFrom(f: DateRangePreset): Date | null {
  if (f === 'all') return null;
  if (f === '7d') return subDays(new Date(), 7);
  if (f === '30d') return subDays(new Date(), 30);
  return startOfMonth(new Date());
}

/**
 * Pedidos — Tanda T1. Filtros SERVER-SIDE (estado · fecha · tienda · repartidor · pago) con
 * sus índices, KPIs del filtro por count/sum, búsqueda por ID exacto en toda la base (nombre
 * solo en la página), columna Repartidor (nueva), ficha propia y CSV de TODO lo filtrado por
 * cursor. Tienda y repartidor son excluyentes y el filtro de pago no se combina con ellos
 * (no hay índice para esa combinación — la UI lo aclara en vez de fallar).
 */
function AdminOrdersInner() {
  const { user, isAdmin, isFullAdmin } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const counts = useAdminCounts();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get('status');
  const dateParam = searchParams.get('date') as DateRangePreset | null;

  // Las etapas del Resumen enlazan acá con ?status= — se arranca en "Todo" de fecha para no
  // esconder justo los pedidos viejos de ese estado.
  const [status, setStatus] = useState<string>(statusParam && ALL_STATUSES.includes(statusParam) ? statusParam : 'all');
  const [date, setDate] = useState<DateRangePreset>(dateParam && ['7d', '30d', 'month', 'all'].includes(dateParam) ? dateParam : statusParam ? 'all' : '30d');
  const [storeId, setStoreId] = useState('all');
  const [driverId, setDriverId] = useState('all');
  const [payment, setPayment] = useState('all');
  const [search, setSearch] = useState('');
  const [idResult, setIdResult] = useState<OrderRow | null>(null);
  const [idSearching, setIdSearching] = useState(false);
  const [refundOrder, setRefundOrder] = useState<OrderRow | null>(null);

  // Listas para los selects (colecciones acotadas: pueblo chico), una sola vez.
  const [stores, setStores] = useState<{ value: string; label: string }[]>([]);
  const [drivers, setDrivers] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    getDocs(collection(db, 'stores')).then(s => { if (!cancelled) setStores(s.docs.map(d => ({ value: d.id, label: String(d.data().name || d.id) })).sort((a, b) => a.label.localeCompare(b.label))); }).catch(() => {});
    getDocs(query(collection(db, 'users'), where('role', '==', 'delivery'))).then(s => { if (!cancelled) setDrivers(s.docs.map(d => ({ value: d.id, label: String(d.data().displayName || d.data().name || d.data().email || d.id) })).sort((a, b) => a.label.localeCompare(b.label))); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isAdmin]);

  const from = useMemo(() => dateFrom(date), [date]);
  const fromTs = useMemo(() => (from ? Timestamp.fromDate(from) : null), [from]);
  const ordersCol = useMemo(() => collection(db, 'orders'), []);
  const entityFilterActive = storeId !== 'all' || driverId !== 'all';

  // Restricciones comunes (sin estado): fecha + tienda | repartidor | pago.
  const baseConstraints = useCallback((): QueryConstraint[] => {
    const c: QueryConstraint[] = [];
    if (storeId !== 'all') c.push(where('storeId', '==', storeId));
    else if (driverId !== 'all') c.push(where('deliveryPersonId', '==', driverId));
    else if (payment !== 'all') c.push(where('paymentStatus', '==', payment));
    if (fromTs) c.push(where('createdAt', '>=', fromTs));
    return c;
  }, [storeId, driverId, payment, fromTs]);

  const build = useCallback((cursor: QueryDocumentSnapshot | null, size: number): Query | null => {
    if (!isAdmin) return null;
    const c = baseConstraints();
    if (status !== 'all') c.unshift(where('status', '==', status));
    return query(ordersCol, ...c, orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(size));
  }, [isAdmin, ordersCol, baseConstraints, status]);

  const countQuery = useMemo(() => {
    if (!isAdmin) return null;
    const c = baseConstraints();
    if (status !== 'all') c.unshift(where('status', '==', status));
    return query(ordersCol, ...c);
  }, [isAdmin, ordersCol, baseConstraints, status]);

  const paged = usePagedQuery<OrderRow>({ build, countQuery, pageSize: PAGE_SIZE, enabled: isAdmin });

  // Conteo por estado para los chips (mismo filtro, sin estado): 10 counts por cambio de filtro.
  const [chipCounts, setChipCounts] = useState<Record<string, number | null>>({});
  const [chipTick, setChipTick] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setChipCounts({});
    const base = baseConstraints();
    const entries: [string, Query][] = [['all', query(ordersCol, ...base)], ...ALL_STATUSES.map(s => [s, query(ordersCol, where('status', '==', s), ...base)] as [string, Query])];
    Promise.all(entries.map(([k, qq]) => getCountFromServer(qq).then(s => [k, s.data().count] as const).catch(() => [k, null] as const)))
      .then(res => { if (!cancelled) setChipCounts(Object.fromEntries(res)); });
    return () => { cancelled = true; };
  }, [isAdmin, ordersCol, baseConstraints, chipTick]);

  // KPIs del filtro. Facturado bruto = sum(total) de ENTREGADOS del período; solo cuando no hay
  // filtro de tienda/repartidor/pago (índice (status, createdAt, total) / (status, total)).
  const grossQ = useMemoFirebase(() => {
    if (!isAdmin || entityFilterActive || payment !== 'all') return null;
    return query(ordersCol, where('status', '==', 'Entregado'), ...(fromTs ? [where('createdAt', '>=', fromTs)] : []));
  }, [isAdmin, ordersCol, entityFilterActive, payment, fromTs]);
  const gross = useAggregate(grossQ, { total: sum('total') });
  const cancelledCount = chipCounts['Cancelado'] === null || chipCounts['Rechazado'] === null || chipCounts['Cancelado'] === undefined || chipCounts['Rechazado'] === undefined
    ? null : (chipCounts['Cancelado'] ?? 0) + (chipCounts['Rechazado'] ?? 0);

  // Búsqueda por ID exacto contra toda la colección (getDoc directo, 1 lectura).
  useEffect(() => {
    const term = search.trim();
    if (!isAdmin || term.length < ORDER_ID_MIN_LEN) { setIdResult(null); return; }
    let cancelled = false;
    setIdSearching(true);
    getDoc(doc(db, 'orders', term))
      .then(s => { if (!cancelled) setIdResult(s.exists() ? ({ id: s.id, ...s.data() } as OrderRow) : null); })
      .catch(() => { if (!cancelled) setIdResult(null); })
      .finally(() => { if (!cancelled) setIdSearching(false); });
    return () => { cancelled = true; };
  }, [isAdmin, search]);

  const rows = useMemo(() => {
    if (idResult) return [idResult];
    const t = search.trim().toLowerCase();
    if (!t) return paged.rows;
    return paged.rows.filter(o => o.customerName?.toLowerCase().includes(t) || o.storeName?.toLowerCase().includes(t) || o.deliveryPersonName?.toLowerCase().includes(t) || o.id.toLowerCase().includes(t));
  }, [paged.rows, search, idResult]);

  const reloadAll = () => { paged.reload(); setChipTick(t => t + 1); void gross.refresh(); void counts.refresh(); };

  /* ── Acciones ─────────────────────────────────────────────────────────────── */
  const handleCancel = async (o: OrderRow) => {
    if (!user) return;
    const { ok, values } = await confirm({
      title: `¿Cancelar el pedido #${o.id.slice(0, 7)}?`,
      description: <>De <strong>{o.customerName}</strong> en <strong>{o.storeName}</strong> por {money(o.total)}. Se avisa al comprador y a la tienda{o.deliveryPersonId ? ' y al repartidor' : ''}. Si estaba pagado, queda registrado como pasivo a devolver.</>,
      tone: 'destructive', confirmLabel: 'Cancelar pedido', cancelLabel: 'Volver',
      fields: [{ key: 'reason', label: 'Motivo (opcional, lo ven ambos)', type: 'textarea', placeholder: 'Ej: la tienda cerró sin avisar' }],
      onConfirm: async (v) => {
        const res = await authedFetch('/api/orders/cancel', user, { orderId: o.id, userId: o.userId, reason: v.reason });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
        void logAdminAction(db, user.uid, 'cancel_order', o.id, v.reason || '');
      },
    });
    if (!ok) return;
    toast({ title: 'Pedido cancelado', description: `Motivo: ${values.reason || 'sin motivo'}` });
    reloadAll();
  };

  // 🧪 SOLO PRUEBAS — SACAR ANTES DE LANZAR (junto con /api/admin/approve-test-payment).
  const handleApproveTestPayment = async (o: OrderRow) => {
    if (!user) return;
    const { ok } = await confirm({
      title: '🧪 Pago de prueba',
      description: <>¿Marcar como PAGADO el pedido de <strong>{o.customerName || 'cliente'}</strong> en <strong>{o.storeName || 'la tienda'}</strong> por {money(o.total)}? Simula que MercadoPago aprobó el pago (no mueve plata real). El pedido pasa a &quot;En preparación&quot; y se notifica a la tienda y al cliente.</>,
      confirmLabel: 'Aprobar pago de prueba',
      onConfirm: async () => {
        const res = await authedFetch('/api/admin/approve-test-payment', user, { orderId: o.id });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      },
    });
    if (!ok) return;
    toast({ title: '🧪 Pago de prueba aprobado', description: 'El pedido pasó a "En preparación".' });
    reloadAll();
  };

  const rowActions = (o: OrderRow): RowAction<OrderRow>[] => {
    const a: RowAction<OrderRow>[] = [
      { label: 'Ver ficha', href: `/admin/orders/${o.id}`, icon: <FileText className="h-4 w-4" aria-hidden="true" /> },
      { label: 'Ver como cliente', href: `/orders/${o.id}`, newTab: true, icon: <ExternalLink className="h-4 w-4" aria-hidden="true" /> },
    ];
    if (o.status === 'Pendiente de Pago' && isFullAdmin) a.push({ label: '🧪 Aprobar pago (prueba)', tone: 'success', separatorBefore: true, onClick: handleApproveTestPayment });
    if (o.paymentStatus === 'paid' && !o.refunded && isFullAdmin) a.push({ label: 'Registrar reembolso', tone: 'warning', icon: <Undo2 className="h-4 w-4" aria-hidden="true" />, onClick: (row) => setRefundOrder(row) });
    if (CANCELABLE_BY_ADMIN.has(o.status)) a.push({ label: 'Cancelar pedido', tone: 'destructive', separatorBefore: true, icon: <XCircle className="h-4 w-4" aria-hidden="true" />, onClick: handleCancel });
    return a;
  };

  /* ── Columnas ─────────────────────────────────────────────────────────────── */
  const columns: DataColumn<OrderRow>[] = [
    { key: 'date', header: 'Fecha', width: '110px', cell: o => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{fmtDate(o.createdAt, 'short')}</span> },
    { key: 'id', header: 'Pedido', width: '110px', cell: o => <EntityLink type="order" id={o.id} /> },
    { key: 'customer', header: 'Cliente', cell: o => <EntityLink type="user" id={o.userId} label={o.customerName || '—'} quick /> },
    { key: 'store', header: 'Tienda', cell: o => <EntityLink type="store" id={o.storeId} label={o.storeName || '—'} /> },
    { key: 'driver', header: 'Repartidor', cell: o => o.deliveryPersonId ? <EntityLink type="driver" id={o.deliveryPersonId} label={o.deliveryPersonName || o.deliveryPersonId.slice(0, 8)} /> : <span className="text-muted-foreground">—</span> },
    { key: 'total', header: 'Total', align: 'right', cell: o => <span className="font-medium">{money(o.total)}</span> },
    { key: 'payment', header: 'Pago', cell: o => o.hasPaymentIssue ? <StatusBadge kind="mismatch" value="amount_mismatch" className="max-w-[160px]" /> : <StatusBadge kind="payment" value={o.paymentStatus} /> },
    { key: 'status', header: 'Estado', cell: o => (
      <span className="flex flex-wrap items-center gap-1">
        <StatusBadge kind="order" value={o.status} />
        {o.refunded && <StatusBadge kind="payment" value="refunded" suffix={money(o.refundAmount)} />}
        {o.hasClaim && <span className="inline-flex h-[22px] items-center rounded-full bg-warning/15 px-2 text-xs font-semibold text-warning-ink">Reclamo</span>}
      </span>
    ) },
  ];

  const chips: FilterChip[] = [{ value: 'all', label: 'Todos', count: chipCounts.all ?? null }, ...ALL_STATUSES.map(s => ({ value: s, label: s, count: chipCounts[s] ?? null }))];

  const exportCsv = async () => {
    const { rows: all, capped } = await paged.exportAll(5000);
    const csv: CsvRow[] = all.map(o => ({
      ID: o.id, Fecha: fmtDate(o.createdAt, 'long'), Cliente: o.customerName || '', Tienda: o.storeName || '', Repartidor: o.deliveryPersonName || '',
      Estado: o.status, Pago: o.paymentStatus || '', Total: o.total ?? 0, Subtotal: o.subtotal ?? '', 'Envío': o.deliveryFee ?? 0, 'Tarifa de servicio': o.serviceFee ?? 0,
      'Comisión %': o.commissionRate ?? '', 'Comisión $': o.commissionAmount != null ? Math.round(o.commissionAmount) : '', Reembolsado: o.refunded ? (o.refundAmount ?? 'sí') : '',
      'Método de pago': o.paymentMethod || '', 'Problema de pago': o.hasPaymentIssue ? 'sí' : '', Reclamo: o.hasClaim ? 'sí' : '',
    }));
    return { rows: csv, capped };
  };

  const clear = () => { setStatus('all'); setDate('30d'); setStoreId('all'); setDriverId('all'); setPayment('all'); setSearch(''); };

  return (
    <AdminPage
      title="Pedidos"
      subtitle={`${date === 'all' ? 'Todo el historial' : date === '7d' ? 'Últimos 7 días' : date === 'month' ? 'Este mes' : 'Últimos 30 días'} · filtros aplicados en el servidor`}
      crumbs={[{ label: 'Operación' }, { label: 'Pedidos' }]}
      kpis={
        <KpiRow cols={4}>
          <KpiCard testId="kpi-total" label="Pedidos" value={chipCounts.all ?? null} />
          <KpiCard testId="kpi-delivered" label="Entregados" value={chipCounts['Entregado'] ?? null} tone="success"
            suffix={typeof chipCounts.all === 'number' && chipCounts.all > 0 && typeof chipCounts['Entregado'] === 'number' ? `${Math.round((chipCounts['Entregado'] / chipCounts.all) * 100)} %` : undefined} />
          <KpiCard testId="kpi-cancelled" label="Cancelados + rechazados" value={cancelledCount} tone="destructive" />
          <KpiCard testId="kpi-gross" label="Facturado bruto (entregados)" format="money" value={grossQ ? (gross.data?.total ?? null) : '—'} error={gross.error} onRetry={gross.refresh}
            hint={grossQ ? 'suma de totales, sin descontar reembolsos' : 'no disponible con filtro de tienda, repartidor o pago'} />
        </KpiRow>
      }
      filters={
        <FilterBar
          chips={chips} chipValue={status} onChipChange={setStatus}
          dateRange={{ value: date, onChange: setDate }}
          selects={[
            { key: 'store', label: 'Tienda', options: stores, value: storeId, allLabel: 'Todas las tiendas', onChange: (v) => { setStoreId(v); if (v !== 'all') { setDriverId('all'); setPayment('all'); } } },
            { key: 'driver', label: 'Repartidor', options: drivers, value: driverId, allLabel: 'Todos los repartidores', onChange: (v) => { setDriverId(v); if (v !== 'all') { setStoreId('all'); setPayment('all'); } }, hint: 'Tienda y repartidor son excluyentes: elegí uno.' },
            { key: 'payment', label: 'Pago', options: PAYMENT_OPTIONS, value: payment, allLabel: 'Cualquier pago', onChange: setPayment, disabled: entityFilterActive, hint: entityFilterActive ? 'El filtro de pago no se combina con tienda/repartidor.' : undefined },
          ]}
          search={{ value: search, onChange: setSearch, placeholder: 'ID de pedido o nombre', scope: 'mixed', busy: idSearching,
            hint: idResult ? 'Pedido encontrado por ID: se muestra aunque esté fuera de los filtros.' : search.trim().length >= ORDER_ID_MIN_LEN && !idSearching ? 'No existe ningún pedido con ese ID. Cliente/tienda/repartidor se filtran solo sobre esta página.' : 'Un ID exacto busca en toda la base. Un nombre busca solo en esta página.' }}
          onClear={clear}
        />
      }
    >
      <DataTable<OrderRow>
        testId="orders-table"
        columns={columns}
        rows={rows}
        rowKey={o => o.id}
        noun="pedidos"
        loading={paged.loading}
        error={paged.error}
        onRetry={reloadAll}
        refreshedAt={paged.refreshedAt}
        pagination={idResult ? undefined : { page: paged.page, pageSize: PAGE_SIZE, total: paged.total, hasMore: paged.hasMore, hasPrev: paged.hasPrev, onNext: paged.next, onPrev: paged.prev, rangeFrom: paged.rangeFrom, rangeTo: paged.rangeTo }}
        onExportCsv={exportCsv}
        csvFilename={`pedidos_${fmtDate(Date.now(), 'date').replace(/\//g, '-')}.csv`}
        rowActions={rowActions}
        getMobileCard={o => ({
          title: <EntityLink type="order" id={o.id} />,
          badge: <StatusBadge kind="order" value={o.status} />,
          secondary: `${o.customerName || '—'} · ${o.storeName || '—'}${o.deliveryPersonName ? ` · ${o.deliveryPersonName}` : ''} · ${fmtDate(o.createdAt, 'short')}`,
          right: money(o.total),
        })}
        empty={{ title: 'No hay pedidos con este filtro', description: 'Probá ampliar el período o limpiar los filtros.' }}
      />
      <RefundDialog order={refundOrder} onOpenChange={(o) => { if (!o) setRefundOrder(null); }} onDone={reloadAll} />
    </AdminPage>
  );
}

export default function AdminOrdersPage() {
  return <Suspense fallback={null}><AdminOrdersInner /></Suspense>;
}
