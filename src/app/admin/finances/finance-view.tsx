'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection, getCountFromServer, getDocs, limit, orderBy, query, startAfter, sum, count, Timestamp, where,
  type Query, type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { subDays, startOfMonth } from 'date-fns';
import { Bike, CheckCircle2, Store as StoreIcon, Wallet, XCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { db, useMemoFirebase } from '@/lib/firebase';
import { useAggregate } from '@/lib/firebase-aggregate';
import { authedFetch } from '@/lib/authed-fetch';
import { money } from '@/lib/format-money';
import { fmtDate } from '@/lib/format-date';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { KpiCard, KpiRow } from '@/components/admin/kpi-card';
import { FilterBar, type DateRangePreset, type FilterChip } from '@/components/admin/filter-bar';
import { DataTable, type CsvRow, type DataColumn, type RowAction } from '@/components/admin/data-table';
import { usePagedQuery } from '@/components/admin/use-paged-query';
import { StatusBadge } from '@/components/admin/status-badge';
import { EntityLink } from '@/components/admin/entity-link';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { useAdminCounts } from '@/components/admin/use-admin-counts';

type Circuit = 'all' | 'store' | 'delivery';
type WStatus = 'all' | 'pending' | 'approved' | 'rejected';
const PAGE_SIZE = 25;
const STATUSES: { value: WStatus; label: string }[] = [
  { value: 'all', label: 'Todos' }, { value: 'pending', label: 'Pendientes' }, { value: 'approved', label: 'Pagados' }, { value: 'rejected', label: 'Rechazados' },
];
const CIRCUITS: { value: Circuit; label: string; hint: string; icon: typeof Wallet }[] = [
  { value: 'all', label: 'Todos los pagos', hint: 'vista combinada', icon: Wallet },
  { value: 'store', label: 'A tiendas', hint: 'venta de productos', icon: StoreIcon },
  { value: 'delivery', label: 'A repartidores', hint: 'envíos realizados', icon: Bike },
];

export interface WithdrawalRow {
  id: string;
  userId: string;
  userName?: string;
  userRole: 'store' | 'delivery';
  amount: number;
  cbu?: string;
  status: 'pending' | 'approved' | 'rejected';
  source?: 'auto' | 'manual';
  createdAt?: unknown;
  processedAt?: unknown;
  operationRef?: string;
  approvedBy?: string;
  adminNote?: string;
  rejectionReason?: string;
  rejectedBy?: string;
}

function dateFrom(f: DateRangePreset): Date | null {
  if (f === 'all') return null;
  if (f === '7d') return subDays(new Date(), 7);
  if (f === '30d') return subDays(new Date(), 30);
  return startOfMonth(new Date());
}

/**
 * Pagos a cuentas (Tanda T2) — la tabla de retiros migrada a DataTable + usePagedQuery:
 * circuito (tienda / repartidor) arriba de todo (Fase JJ: no se mezclan), estado con conteo
 * REAL del filtro, origen auto/manual y rango de fecha SERVER-SIDE (índices
 * `withdrawals (source, …, createdAt↓)`), búsqueda por nombre solo en la página (aclarado),
 * total server-side ("N solicitudes" antes era lo cargado), CSV de TODO lo filtrado, y
 * Pagar/Rechazar por ConfirmDialog contra las MISMAS APIs (approve/reject-withdrawal). Las
 * aggregations por estado respetan el circuito (índice (status, userRole, amount)).
 * Principio del producto: el dinero nunca sale solo — aprobar REGISTRA una transferencia
 * que el admin ya hizo a mano, con su comprobante.
 */
export function FinanceView() {
  const { user, isFullAdmin } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const counts = useAdminCounts();

  const [circuit, setCircuit] = useState<Circuit>('all');
  const [status, setStatus] = useState<WStatus>('all');
  const [source, setSource] = useState('all');
  const [date, setDate] = useState<DateRangePreset>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const col = useMemo(() => collection(db, 'withdrawals'), []);

  // El retiro guarda el uid del DUEÑO; para linkear a la ficha de la tienda hace falta su id.
  // `stores` es una colección acotada (pueblo chico): se baja una vez, como en Pedidos.
  const [storeByOwner, setStoreByOwner] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isFullAdmin) return;
    let cancelled = false;
    getDocs(collection(db, 'stores')).then(snap => {
      if (cancelled) return;
      const m: Record<string, string> = {};
      snap.docs.forEach(d => { const owner = d.data().ownerId; if (typeof owner === 'string' && !m[owner]) m[owner] = d.id; });
      setStoreByOwner(m);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isFullAdmin]);
  const fromTs = useMemo(() => { const d = dateFrom(date); return d ? Timestamp.fromDate(d) : null; }, [date]);

  // Restricciones comunes del filtro (sin estado): circuito + origen + fecha.
  const baseConstraints = useCallback((): QueryConstraint[] => {
    const c: QueryConstraint[] = [];
    if (source !== 'all') c.push(where('source', '==', source));
    if (circuit !== 'all') c.push(where('userRole', '==', circuit));
    if (fromTs) c.push(where('createdAt', '>=', fromTs));
    return c;
  }, [source, circuit, fromTs]);

  const build = useCallback((cursor: QueryDocumentSnapshot | null, size: number): Query | null => {
    if (!isFullAdmin) return null;
    const c = baseConstraints();
    if (status !== 'all') c.unshift(where('status', '==', status));
    return query(col, ...c, orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(size));
  }, [isFullAdmin, col, baseConstraints, status]);

  const countQuery = useMemo(() => {
    if (!isFullAdmin) return null;
    const c = baseConstraints();
    if (status !== 'all') c.unshift(where('status', '==', status));
    return query(col, ...c);
  }, [isFullAdmin, col, baseConstraints, status]);

  const paged = usePagedQuery<WithdrawalRow>({ build, countQuery, pageSize: PAGE_SIZE, enabled: isFullAdmin });

  // Chips de estado con el conteo REAL del filtro (4 counts por cambio de filtro).
  const [chipCounts, setChipCounts] = useState<Record<string, number | null>>({});
  const [chipTick, setChipTick] = useState(0);
  useEffect(() => {
    if (!isFullAdmin) return;
    let cancelled = false;
    setChipCounts({});
    const base = baseConstraints();
    const entries: [string, Query][] = [['all', query(col, ...base)], ...(['pending', 'approved', 'rejected'] as const).map(s => [s, query(col, where('status', '==', s), ...base)] as [string, Query])];
    Promise.all(entries.map(([k, qq]) => getCountFromServer(qq).then(s => [k, s.data().count] as const).catch(() => [k, null] as const)))
      .then(res => { if (!cancelled) setChipCounts(Object.fromEntries(res)); });
    return () => { cancelled = true; };
  }, [isFullAdmin, col, baseConstraints, chipTick]);

  // KPIs del circuito (histórico, sin origen/fecha): pendiente / pagado / rechazado por aggregation.
  const aggQ = useCallback((s: string) => (isFullAdmin ? query(col, where('status', '==', s), ...(circuit !== 'all' ? [where('userRole', '==', circuit)] : [])) : null), [isFullAdmin, col, circuit]);
  const pendingQ = useMemoFirebase(() => aggQ('pending'), [aggQ]);
  const approvedQ = useMemoFirebase(() => aggQ('approved'), [aggQ]);
  const rejectedQ = useMemoFirebase(() => aggQ('rejected'), [aggQ]);
  const pendingAgg = useAggregate(pendingQ, { total: sum('amount'), n: count() }, { refreshOnFocus: true });
  const approvedAgg = useAggregate(approvedQ, { total: sum('amount'), n: count() }, { refreshOnFocus: true });
  const rejectedAgg = useAggregate(rejectedQ, { total: sum('amount'), n: count() }, { refreshOnFocus: true });

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return paged.rows;
    return paged.rows.filter(w => (w.userName || '').toLowerCase().includes(t) || (w.cbu || '').toLowerCase().includes(t) || (w.operationRef || '').toLowerCase().includes(t));
  }, [paged.rows, search]);

  const reloadAll = useCallback(() => {
    paged.reload(); setChipTick(t => t + 1);
    void pendingAgg.refresh(); void approvedAgg.refresh(); void rejectedAgg.refresh();
    void counts.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged.reload, pendingAgg.refresh, approvedAgg.refresh, rejectedAgg.refresh, counts.refresh]);

  /* ── Acciones (mismas APIs; ConfirmDialog con la misma info y comprobante obligatorio) ── */
  const handleApprove = async (w: WithdrawalRow) => {
    if (!user) return;
    const { ok, values } = await confirm({
      title: 'Registrar pago',
      description: (
        <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between gap-2"><span className="text-muted-foreground">Destinatario</span><span className="font-medium text-foreground">{w.userName || w.userId}</span></div>
          <div className="flex justify-between gap-2"><span className="text-muted-foreground">Tipo</span><span className="font-medium text-foreground">{w.userRole === 'store' ? 'Tienda' : 'Repartidor'}</span></div>
          <div className="flex justify-between gap-2"><span className="text-muted-foreground">CBU / Alias</span><span className="font-mono text-xs text-foreground">{w.cbu || '—'}</span></div>
          <div className="flex justify-between gap-2 border-t border-border pt-1.5"><span className="text-muted-foreground">Monto a transferir</span><span className="text-base font-bold text-foreground">{money(w.amount)}</span></div>
          <p className="pt-1 text-xs">Esto NO transfiere: registra la transferencia que ya hiciste (banco/MP). El servidor recalcula el saldo real y rechaza si el monto lo supera.</p>
        </div>
      ),
      confirmLabel: 'Ya transferí — registrar',
      fields: [
        { key: 'operationRef', label: 'Número de operación / comprobante', required: true, min: 4, placeholder: 'Ej: 4821-9930 (el que te da el banco o MP)', hint: 'Queda guardado con el pago. Sin esto no hay forma de rastrear la transferencia si después reclaman.' },
        { key: 'note', label: 'Nota interna (opcional)', type: 'textarea', placeholder: 'Ej: transferido desde la cuenta de MercadoPago.' },
      ],
      onConfirm: async (v) => {
        const res = await authedFetch('/api/admin/approve-withdrawal', user, { withdrawalId: w.id, operationRef: v.operationRef, note: v.note });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      },
    });
    if (!ok) return;
    toast({ title: 'Pago registrado', description: `${money(w.amount)} a ${w.userName || 'la cuenta'} · op. ${values.operationRef}` });
    reloadAll();
  };

  const handleReject = async (w: WithdrawalRow) => {
    if (!user) return;
    const { ok } = await confirm({
      title: 'Rechazar solicitud de retiro',
      description: <>De <strong>{w.userName || w.userId}</strong> ({w.userRole === 'store' ? 'tienda' : 'repartidor'}) por {money(w.amount)}. El monto vuelve a su saldo disponible y se le avisa con el motivo.</>,
      tone: 'destructive', confirmLabel: 'Confirmar rechazo',
      fields: [{ key: 'reason', label: 'Motivo del rechazo (opcional, lo verá el usuario)', type: 'textarea', placeholder: 'Ej: El CBU ingresado no es válido. Actualizalo desde tu billetera.' }],
      onConfirm: async (v) => {
        const res = await authedFetch('/api/admin/reject-withdrawal', user, { withdrawalId: w.id, reason: v.reason });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      },
    });
    if (!ok) return;
    toast({ title: 'Solicitud rechazada', description: 'El monto vuelve al saldo disponible del usuario.' });
    reloadAll();
  };

  const rowActions = (w: WithdrawalRow): RowAction<WithdrawalRow>[] => {
    const a: RowAction<WithdrawalRow>[] = [
      { label: w.userRole === 'store' ? 'Ver ficha de la tienda' : 'Ver ficha del repartidor', href: w.userRole === 'store' ? (storeByOwner[w.userId] ? `/admin/stores/${storeByOwner[w.userId]}` : `/admin/users?q=${encodeURIComponent(w.userId)}`) : `/admin/delivery/${w.userId}` },
    ];
    if (w.status === 'pending') {
      a.push({ label: 'Pagar (registrar transferencia)', tone: 'success', separatorBefore: true, icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />, disabled: busyId === w.id, onClick: async (row) => { setBusyId(row.id); try { await handleApprove(row); } finally { setBusyId(null); } } });
      a.push({ label: 'Rechazar', tone: 'destructive', icon: <XCircle className="h-4 w-4" aria-hidden="true" />, disabled: busyId === w.id, onClick: async (row) => { setBusyId(row.id); try { await handleReject(row); } finally { setBusyId(null); } } });
    }
    return a;
  };

  const columns: DataColumn<WithdrawalRow>[] = [
    { key: 'date', header: 'Solicitado', width: '110px', cell: w => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{fmtDate(w.createdAt, 'short')}</span> },
    { key: 'account', header: 'Cuenta', cell: w => w.userRole === 'store'
      ? (storeByOwner[w.userId] ? <EntityLink type="store" id={storeByOwner[w.userId]} label={w.userName || w.userId} /> : <EntityLink type="user" id={w.userId} label={w.userName || w.userId} quick />)
      : <EntityLink type="driver" id={w.userId} label={w.userName || w.userId} /> },
    { key: 'role', header: 'Circuito', cell: w => <span className={cn('inline-flex h-[22px] items-center rounded-full px-2 text-xs font-semibold', w.userRole === 'store' ? 'bg-info/15 text-info-ink' : 'bg-primary/15 text-primary-ink')}>{w.userRole === 'store' ? 'Tienda' : 'Repartidor'}</span> },
    { key: 'amount', header: 'Monto', align: 'right', cell: w => <span className="font-semibold">{money(w.amount)}</span> },
    { key: 'cbu', header: 'CBU / Alias', cell: w => <span className="block max-w-[160px] truncate font-mono text-xs" title={w.cbu}>{w.cbu || '—'}</span> },
    { key: 'source', header: 'Origen', cell: w => <span className={cn('inline-flex h-[22px] items-center rounded-full px-2 text-xs font-semibold', w.source === 'auto' ? 'bg-muted text-muted-foreground' : 'bg-warning/15 text-warning-ink')}>{w.source === 'auto' ? 'Automático' : 'Manual'}</span> },
    { key: 'status', header: 'Estado', cell: w => (
      <span className="flex flex-col gap-0.5">
        <StatusBadge kind="withdrawal" value={w.status} />
        {w.status === 'approved' && w.operationRef && <span className="font-mono text-xs text-muted-foreground" title="Número de operación">op. {w.operationRef}</span>}
        {w.status === 'rejected' && w.rejectionReason && <span className="max-w-[200px] truncate text-xs text-muted-foreground" title={w.rejectionReason}>{w.rejectionReason}</span>}
      </span>
    ) },
    { key: 'processed', header: 'Procesado', width: '110px', cell: w => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{w.processedAt ? fmtDate(w.processedAt, 'short') : '—'}</span> },
  ];

  const chips: FilterChip[] = STATUSES.map(s => ({ value: s.value, label: s.label, count: chipCounts[s.value] ?? null }));

  const exportCsv = async () => {
    const { rows: all, capped } = await paged.exportAll(5000);
    const csv: CsvRow[] = all.map(w => ({
      'Fecha solicitud': fmtDate(w.createdAt, 'long'), 'Fecha procesado': w.processedAt ? fmtDate(w.processedAt, 'long') : '', Usuario: w.userName || '', 'ID usuario': w.userId,
      Rol: w.userRole === 'store' ? 'Tienda' : 'Repartidor', Monto: w.amount ?? 0, 'CBU/Alias': w.cbu || '',
      Estado: w.status === 'pending' ? 'Pendiente' : w.status === 'approved' ? 'Pagado' : 'Rechazado', Origen: w.source === 'auto' ? 'Automático' : 'Manual',
      'N° operación': w.operationRef || '', 'Aprobado por': w.approvedBy || '', 'Nota admin': w.adminNote || '', 'Motivo rechazo': w.rejectionReason || '', 'Rechazado por': w.rejectedBy || '',
    }));
    return { rows: csv, capped };
  };

  const kpiState = (agg: { data: { total: number; n: number } | null; error: Error | null; refresh: () => void }) => ({ value: agg.error ? '—' : agg.data ? agg.data.total : null, error: agg.error, onRetry: agg.refresh, n: agg.data?.n });

  return (
    <div className="space-y-4">
      {/* Circuito ARRIBA de los totales (Fase KK): todo lo de abajo queda acotado a él. */}
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Circuito de pago">
        {CIRCUITS.map(({ value, label, hint, icon: Icon }) => {
          const active = circuit === value;
          return (
            <button key={value} type="button" onClick={() => setCircuit(value)} aria-pressed={active} data-circuit={value}
              className={cn('rounded-lg border p-3 text-left transition-colors', active ? 'border-primary/50 bg-primary/10' : 'glass hover:bg-admin-row-hover')}>
              <span className="flex items-center gap-2"><Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary-ink' : 'text-muted-foreground')} aria-hidden="true" /><span className={cn('text-sm font-semibold', active && 'text-primary-ink')}>{label}</span></span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
            </button>
          );
        })}
      </div>

      <KpiRow cols={4}>
        {(() => { const k = kpiState(pendingAgg); return <KpiCard testId="kpi-pending" label="Pendiente de pago" value={k.value} format={k.value === '—' ? 'text' : 'money'} tone="warning" error={k.error} onRetry={k.onRetry} hint={typeof k.n === 'number' ? `${k.n} solicitud${k.n === 1 ? '' : 'es'} esperando tu aprobación` : undefined} />; })()}
        {(() => { const k = kpiState(approvedAgg); return <KpiCard testId="kpi-paid" label="Total pagado" value={k.value} format={k.value === '—' ? 'text' : 'money'} tone="success" error={k.error} onRetry={k.onRetry} hint={typeof k.n === 'number' ? `${k.n} transferencia${k.n === 1 ? '' : 's'} · histórico` : undefined} />; })()}
        {(() => { const k = kpiState(rejectedAgg); return <KpiCard testId="kpi-rejected" label="Total rechazado" value={k.value} format={k.value === '—' ? 'text' : 'money'} error={k.error} onRetry={k.onRetry} hint="volvió al saldo del usuario" />; })()}
        <KpiCard testId="kpi-liability-link" label="Pasivo real" value="→" format="text" hint="cuánto se debe hoy, incluido lo no solicitado — en Resumen financiero" href="/admin/finances" />
      </KpiRow>

      <FilterBar
        chips={chips} chipValue={status} onChipChange={(v) => setStatus(v as WStatus)}
        dateRange={{ value: date, onChange: setDate, defaultValue: 'all' }}
        selects={[{ key: 'source', label: 'Origen', options: [{ value: 'auto', label: 'Automático (liquidación semanal)' }, { value: 'manual', label: 'Manual (lo pidió la cuenta)' }], value: source, onChange: setSource, allLabel: 'Cualquier origen' }]}
        search={{ value: search, onChange: setSearch, placeholder: 'Nombre, CBU o n° de operación', scope: 'page', hint: 'La búsqueda filtra solo esta página. Estado, circuito, origen y fecha se aplican en el servidor sobre todo el historial.' }}
        onClear={() => { setStatus('all'); setSource('all'); setDate('all'); setSearch(''); }}
      />

      <DataTable<WithdrawalRow>
        testId="payouts-table"
        columns={columns}
        rows={rows}
        rowKey={w => w.id}
        noun="solicitudes"
        loading={paged.loading}
        error={paged.error}
        onRetry={reloadAll}
        refreshedAt={paged.refreshedAt}
        pagination={{ page: paged.page, pageSize: PAGE_SIZE, total: paged.total, hasMore: paged.hasMore, hasPrev: paged.hasPrev, onNext: paged.next, onPrev: paged.prev, rangeFrom: paged.rangeFrom, rangeTo: paged.rangeTo }}
        onExportCsv={exportCsv}
        csvFilename={`retiros_${fmtDate(Date.now(), 'date').replace(/\//g, '-')}.csv`}
        rowActions={rowActions}
        rowClassName={w => (w.status === 'pending' ? 'bg-warning/5' : undefined)}
        getMobileCard={w => ({
          title: w.userName || w.userId, badge: <StatusBadge kind="withdrawal" value={w.status} />,
          secondary: `${w.userRole === 'store' ? 'Tienda' : 'Repartidor'} · ${w.source === 'auto' ? 'auto' : 'manual'} · ${fmtDate(w.createdAt, 'short')}${w.operationRef ? ` · op. ${w.operationRef}` : ''}`,
          right: money(w.amount),
        })}
        empty={{ icon: Wallet, title: 'No hay solicitudes con este filtro', description: 'Las solicitudes nacen cuando una cuenta pide un retiro o cuando la liquidación semanal las genera.' }}
      />
    </div>
  );
}
