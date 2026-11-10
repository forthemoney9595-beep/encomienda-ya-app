'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, serverTimestamp, startAfter, updateDoc, where,
  type Query, type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { AlertCircle, CheckCircle2, ExternalLink, RefreshCw, ScanSearch, Undo2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { authedFetch } from '@/lib/authed-fetch';
import { logAdminAction } from '@/lib/admin-audit';
import { money } from '@/lib/format-money';
import { fmtDate, fmtElapsed, toMillis } from '@/lib/format-date';
import { REASON_LABELS, REASON_HINTS, reasonLabel } from '@/lib/payment-issues';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import AdminAuthGuard from '../admin-auth-guard';
import { AdminPage } from '@/components/admin/admin-page';
import { KpiCard, KpiRow } from '@/components/admin/kpi-card';
import { FilterBar, type FilterChip } from '@/components/admin/filter-bar';
import { DataTable, type DataColumn, type RowAction } from '@/components/admin/data-table';
import { usePagedQuery } from '@/components/admin/use-paged-query';
import { StatusBadge } from '@/components/admin/status-badge';
import { EntityLink } from '@/components/admin/entity-link';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { RefundDialog, type RefundDialogOrder } from '@/components/admin/refund-dialog';
import { useAdminCounts } from '@/components/admin/use-admin-counts';

type Tab = 'pending' | 'resolved' | 'runs';
const PAGE_SIZE = 25;
const REASONS = Object.keys(REASON_LABELS);
// Motivos en los que corresponde devolverle plata al comprador desde la propia fila.
const REFUNDABLE_REASONS = new Set(['cancelled_after_payment', 'duplicate_payment', 'amount_mismatch', 'unexpected_order_status']);

interface MismatchRow {
  id: string;
  orderId: string;
  paymentId?: string | number | null;
  previousPaymentId?: string | number | null;
  reason: string;
  paidAmount?: number;
  orderTotal?: number;
  mpStatus?: string;
  orderStatus?: string;
  cancelledBy?: string;
  source?: string;
  resolved?: boolean;
  resolvedAt?: unknown;
  resolvedBy?: string;
  resolutionNote?: string;
  createdAt?: unknown;
}
interface RunRow {
  id: string;
  startedAt?: unknown; finishedAt?: unknown;
  status?: 'running' | 'done';
  source?: 'cron' | 'manual';
  byUid?: string;
  checkedOrders?: number; checkedPayments?: number; ok?: number; repaired?: number; flagged?: number; unverifiable?: number; errors?: number;
  notes?: string[];
}
interface OrderStub { id: string; customerName?: string; storeName?: string; storeId?: string; userId?: string; total?: number; paymentStatus?: string; refunded?: boolean; exists: boolean }

function describeMismatch(m: MismatchRow): React.ReactNode {
  switch (m.reason) {
    case 'amount_mismatch': return <>Pagado <strong>{money(m.paidAmount)}</strong> vs. pedido <strong>{money(m.orderTotal)}</strong></>;
    case 'unexpected_order_status': return <>Pago recibido con el pedido en <strong>&quot;{m.orderStatus}&quot;</strong> (esperaba &quot;Pendiente de Pago&quot;)</>;
    case 'duplicate_payment': return <>Se cobró <strong>{money(m.paidAmount)}</strong> de nuevo sobre un pedido ya pagado</>;
    case 'payment_reversed': return <>MercadoPago revirtió <strong>{money(m.paidAmount)}</strong> (estado: {m.mpStatus})</>;
    case 'cancelled_after_payment': return <>Se canceló con <strong>{money(m.paidAmount)}</strong> ya cobrados (canceló: {m.cancelledBy || '—'})</>;
    case 'reconcile_mismatch': return <>Figura pagada acá pero MP dice <strong>&quot;{m.mpStatus}&quot;</strong></>;
    case 'orphan_payment': return <>Entraron <strong>{money(m.paidAmount)}</strong> en MP para un pedido que no existe</>;
    default: return <>Revisar manualmente</>;
  }
}

/**
 * Conciliación MP (Tanda T2). Pestañas Pendientes / Resueltas SERVER-SIDE (`where resolved ==`,
 * índice (resolved, createdAt↓); antes era un `limit(200)` filtrado en memoria: una
 * discrepancia abierta más vieja que 200 quedaba invisible) con conteo real, filtro por
 * motivo (índice (resolved, reason, createdAt↓)), pestaña NUEVA "Corridas" con el historial
 * paginado de `reconciliations` (antes solo se veía la última), "Conciliar ahora" (full) y
 * resolver con nota obligatoria por ConfirmDialog (antes `window.prompt`). Reembolsar desde la
 * fila con el RefundDialog único cuando el motivo lo amerita.
 */
function PaymentIssuesInner() {
  const { user, isAdmin, isFullAdmin } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const counts = useAdminCounts();
  const [tab, setTab] = useState<Tab>('pending');
  const [reason, setReason] = useState('all');
  const [refundTarget, setRefundTarget] = useState<{ order: RefundDialogOrder; mismatchId: string } | null>(null);

  const mmCol = useMemo(() => collection(db, 'payment_mismatches'), []);
  const runsCol = useMemo(() => collection(db, 'reconciliations'), []);
  const resolvedFlag = tab === 'resolved';

  /* ── Discrepancias (paginadas, server-side) ────────────────────────────────── */
  const mmConstraints = useCallback((): QueryConstraint[] => {
    const c: QueryConstraint[] = [where('resolved', '==', resolvedFlag)];
    if (reason !== 'all') c.push(where('reason', '==', reason));
    return c;
  }, [resolvedFlag, reason]);
  const buildMm = useCallback((cursor: QueryDocumentSnapshot | null, size: number): Query | null =>
    isAdmin && tab !== 'runs' ? query(mmCol, ...mmConstraints(), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(size)) : null, [isAdmin, tab, mmCol, mmConstraints]);
  const countMm = useMemo(() => (isAdmin && tab !== 'runs' ? query(mmCol, ...mmConstraints()) : null), [isAdmin, tab, mmCol, mmConstraints]);
  const mm = usePagedQuery<MismatchRow>({ build: buildMm, countQuery: countMm, pageSize: PAGE_SIZE, enabled: isAdmin && tab !== 'runs' });

  /* ── Corridas de conciliación (paginadas) ──────────────────────────────────── */
  const buildRuns = useCallback((cursor: QueryDocumentSnapshot | null, size: number): Query | null =>
    isAdmin && tab === 'runs' ? query(runsCol, orderBy('startedAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(size)) : null, [isAdmin, tab, runsCol]);
  const countRuns = useMemo(() => (isAdmin && tab === 'runs' ? query(runsCol) : null), [isAdmin, tab, runsCol]);
  const runs = usePagedQuery<RunRow>({ build: buildRuns, countQuery: countRuns, pageSize: PAGE_SIZE, enabled: isAdmin && tab === 'runs' });

  /* ── Conteos reales: pendientes / resueltas / corridas + por motivo del tab ── */
  const [tabCounts, setTabCounts] = useState<{ pending: number | null; resolved: number | null; runs: number | null }>({ pending: null, resolved: null, runs: null });
  const [reasonCounts, setReasonCounts] = useState<Record<string, number | null>>({});
  const [countTick, setCountTick] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setTabCounts({ pending: null, resolved: null, runs: null });
    Promise.all([
      getCountFromServer(query(mmCol, where('resolved', '==', false))).then(s => s.data().count).catch(() => null),
      getCountFromServer(query(mmCol, where('resolved', '==', true))).then(s => s.data().count).catch(() => null),
      getCountFromServer(runsCol).then(s => s.data().count).catch(() => null),
    ]).then(([pending, resolved, r]) => { if (!cancelled) setTabCounts({ pending, resolved, runs: r }); });
    return () => { cancelled = true; };
  }, [isAdmin, mmCol, runsCol, countTick]);
  useEffect(() => {
    if (!isAdmin || tab === 'runs') return;
    let cancelled = false;
    setReasonCounts({});
    Promise.all(REASONS.map(r => getCountFromServer(query(mmCol, where('resolved', '==', resolvedFlag), where('reason', '==', r))).then(s => [r, s.data().count] as const).catch(() => [r, null] as const)))
      .then(res => { if (!cancelled) setReasonCounts(Object.fromEntries(res)); });
    return () => { cancelled = true; };
  }, [isAdmin, tab, resolvedFlag, mmCol, countTick]);

  /* ── Última corrida (tarjeta de arriba) ────────────────────────────────────── */
  const [lastRun, setLastRun] = useState<RunRow | null | undefined>(undefined);
  const [lastRunTick, setLastRunTick] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    getDocs(query(runsCol, orderBy('startedAt', 'desc'), limit(1)))
      .then(s => { if (!cancelled) setLastRun(s.docs[0] ? ({ id: s.docs[0].id, ...s.docs[0].data() } as RunRow) : null); })
      .catch(() => { if (!cancelled) setLastRun(null); });
    return () => { cancelled = true; };
  }, [isAdmin, runsCol, lastRunTick]);

  /* ── Pedidos de las discrepancias en pantalla (≤ 25 lecturas, cacheadas) ──── */
  const [stubs, setStubs] = useState<Record<string, OrderStub>>({});
  useEffect(() => {
    const missing = Array.from(new Set(mm.rows.map(r => r.orderId).filter(id => id && !stubs[id])));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(id => getDoc(doc(db, 'orders', id)).then(s => {
      const o = (s.data() ?? {}) as Partial<OrderStub>;
      return [id, { id, exists: s.exists(), customerName: o.customerName, storeName: o.storeName, storeId: o.storeId, userId: o.userId, total: o.total, paymentStatus: o.paymentStatus, refunded: o.refunded }] as const;
    }).catch(() => [id, { id, exists: false }] as const)))
      .then(res => { if (!cancelled) setStubs(prev => ({ ...prev, ...Object.fromEntries(res) })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mm.rows]);

  const reloadAll = useCallback(() => {
    mm.reload(); runs.reload(); setCountTick(t => t + 1); setLastRunTick(t => t + 1); setStubs({}); void counts.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mm.reload, runs.reload, counts.refresh]);

  /* ── Acciones ──────────────────────────────────────────────────────────────── */
  const [reconciling, setReconciling] = useState(false);
  const [runSummary, setRunSummary] = useState<{ notes?: string[]; checkedOrders?: number; checkedPayments?: number; repaired?: number; flagged?: number; daysUpdated?: number; monthsUpdated?: string[] } | null>(null);
  const handleReconcile = async () => {
    if (!user) return;
    const { ok } = await confirm({
      title: 'Conciliar ahora con MercadoPago',
      description: <>Re-consulta en MP cada pedido pagado de los últimos 30 días (tope 300) y busca pagos aprobados de los últimos 7 días (tope 200) sin pedido marcado. <strong>Puede marcar como pagado un pedido cuyo webhook se perdió</strong> (misma validación que el webhook) y deja todo lo demás acá para revisión manual. También recalcula los cierres diarios y mensuales. Tarda hasta un minuto.</>,
      confirmLabel: 'Conciliar ahora',
      onConfirm: async () => {
        setReconciling(true);
        try {
          const res = await authedFetch('/api/admin/reconcile-mp', user, {});
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
          setRunSummary(data);
        } finally { setReconciling(false); }
      },
    });
    if (!ok) return;
    toast({ title: 'Conciliación terminada', description: 'Revisá el resumen de la corrida y las discrepancias nuevas, si las hubo.' });
    reloadAll();
  };

  const handleResolve = async (m: MismatchRow) => {
    if (!user) return;
    const { ok } = await confirm({
      title: 'Marcar la discrepancia como resuelta',
      description: <>{reasonLabel(m.reason)} · pedido #{m.orderId.slice(0, 7)}. Anotá QUÉ se hizo con esa plata (reembolso, ajuste, verificado en MP). Sin eso, dentro de seis meses nadie sabe cómo se cerró.</>,
      confirmLabel: 'Marcar resuelta',
      fields: [{ key: 'note', label: 'Cómo se resolvió', type: 'textarea', required: true, min: 4, placeholder: 'Ej: verificado en MP, el pago entró completo el 12/8' }],
      onConfirm: async (v) => {
        await updateDoc(doc(db, 'payment_mismatches', m.id), { resolved: true, resolvedAt: serverTimestamp(), resolvedBy: user.uid, resolutionNote: v.note.slice(0, 300) });
        void logAdminAction(db, user.uid, 'resolve_payment_mismatch', m.id, v.note.slice(0, 200));
      },
    });
    if (!ok) return;
    toast({ title: 'Marcada como resuelta' });
    reloadAll();
  };

  const rowActions = (m: MismatchRow): RowAction<MismatchRow>[] => {
    const stub = stubs[m.orderId];
    const a: RowAction<MismatchRow>[] = [
      { label: 'Ver ficha del pedido', href: `/admin/orders/${m.orderId}` },
      { label: 'Ver como cliente', href: `/orders/${m.orderId}`, newTab: true, icon: <ExternalLink className="h-4 w-4" aria-hidden="true" /> },
    ];
    if (!m.resolved) {
      if (isFullAdmin && stub?.exists && stub.paymentStatus === 'paid' && !stub.refunded && REFUNDABLE_REASONS.has(m.reason)) {
        a.push({ label: 'Registrar reembolso al comprador', tone: 'warning', separatorBefore: true, icon: <Undo2 className="h-4 w-4" aria-hidden="true" />, onClick: () => setRefundTarget({ order: { id: m.orderId, customerName: stub.customerName, storeName: stub.storeName, total: stub.total }, mismatchId: m.id }) });
      }
      a.push({ label: 'Marcar resuelta (con nota)', tone: 'success', separatorBefore: true, icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />, onClick: handleResolve });
    }
    return a;
  };

  const mmColumns: DataColumn<MismatchRow>[] = [
    { key: 'date', header: 'Fecha', width: '110px', cell: m => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{fmtDate(m.createdAt, 'short')}</span> },
    { key: 'reason', header: 'Motivo', cell: m => (
      <span className="flex flex-col gap-0.5">
        <StatusBadge kind="mismatch" value={m.reason} resolved={m.resolved} />
        {m.resolved && <span className="text-xs text-muted-foreground">{reasonLabel(m.reason)}</span>}
      </span>
    ) },
    { key: 'detail', header: 'Qué pasó', cell: m => (
      <span className="block max-w-[320px] text-[13px]">
        <span className="block">{describeMismatch(m)}</span>
        {!m.resolved && REASON_HINTS[m.reason] && <span className="block text-xs text-warning-ink">{REASON_HINTS[m.reason]}</span>}
        <span className="block font-mono text-xs text-muted-foreground">pago {m.paymentId ?? '—'}{m.previousPaymentId ? ` · anterior ${m.previousPaymentId}` : ''}{m.source === 'reconcile' ? ' · detectado por la conciliación' : ''}</span>
      </span>
    ) },
    { key: 'order', header: 'Pedido', cell: m => <EntityLink type="order" id={m.orderId} secondary={stubs[m.orderId] && !stubs[m.orderId].exists ? 'no existe' : undefined} /> },
    { key: 'who', header: 'Cliente / Tienda', cell: m => { const s = stubs[m.orderId]; return s?.exists ? (
      <span className="flex flex-col gap-0.5">
        <EntityLink type="user" id={s.userId} label={s.customerName || s.userId?.slice(0, 8) || '—'} quick />
        <EntityLink type="store" id={s.storeId} label={s.storeName || '—'} className="text-xs font-normal text-muted-foreground" />
      </span>
    ) : <span className="text-muted-foreground">{s ? '—' : '…'}</span>; } },
    { key: 'amount', header: 'Pagado / pedido', align: 'right', cell: m => <span className="whitespace-nowrap tabular-nums">{money(m.paidAmount)} <span className="text-muted-foreground">/ {money(m.orderTotal)}</span></span> },
    { key: 'resolution', header: 'Resolución', cell: m => m.resolved ? (
      <span className="block max-w-[260px]">
        <span className="block truncate text-[13px]" title={m.resolutionNote}>{m.resolutionNote || '—'}</span>
        <span className="block text-xs text-muted-foreground">{fmtDate(m.resolvedAt, 'short')}{m.resolvedBy ? ` · ${String(m.resolvedBy).slice(0, 8)}…` : ''}</span>
      </span>
    ) : <span className="text-xs text-warning-ink">pendiente</span> },
  ];

  const runColumns: DataColumn<RunRow>[] = [
    { key: 'when', header: 'Cuándo', width: '130px', cell: r => <span className="whitespace-nowrap tabular-nums">{fmtDate(r.startedAt, 'short')}</span> },
    { key: 'source', header: 'Fuente', cell: r => <span className="flex flex-col"><span className={cn('inline-flex h-[22px] w-fit items-center rounded-full px-2 text-xs font-semibold', r.source === 'cron' ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary-ink')}>{r.source === 'cron' ? 'Automática' : 'Manual'}</span>{r.byUid && <span className="text-xs text-muted-foreground">{r.byUid.slice(0, 8)}…</span>}</span> },
    { key: 'status', header: 'Estado', cell: r => r.status === 'running' || (!r.finishedAt && r.status !== 'done')
      ? <span className="inline-flex h-[22px] items-center rounded-full bg-warning/15 px-2 text-xs font-semibold text-warning-ink">sin terminar</span>
      : <span className="inline-flex h-[22px] items-center rounded-full bg-success/15 px-2 text-xs font-semibold text-[hsl(142_80%_20%)] dark:text-success-ink">terminada</span> },
    { key: 'checked', header: 'Revisados', align: 'right', cell: r => <span className="tabular-nums">{(r.checkedOrders ?? 0) + (r.checkedPayments ?? 0)}{r.unverifiable ? <span className="text-xs text-muted-foreground"> · {r.unverifiable} sin ID de MP</span> : null}</span> },
    { key: 'repaired', header: 'Reparados', align: 'right', cell: r => <span className={cn('tabular-nums', (r.repaired ?? 0) > 0 && 'font-semibold text-success-ink')}>{r.repaired ?? 0}</span> },
    { key: 'flagged', header: 'Marcados', align: 'right', cell: r => <span className={cn('tabular-nums', (r.flagged ?? 0) > 0 && 'font-semibold text-destructive-ink')}>{r.flagged ?? 0}</span> },
    { key: 'errors', header: 'Errores', align: 'right', cell: r => <span className={cn('tabular-nums', (r.errors ?? 0) > 0 && 'font-semibold text-destructive-ink')}>{r.errors ?? 0}</span> },
    { key: 'duration', header: 'Duración', align: 'right', cell: r => { const a = toMillis(r.startedAt), b = toMillis(r.finishedAt); return <span className="tabular-nums text-muted-foreground">{a !== null && b !== null ? `${Math.max(0.1, Math.round((b - a) / 100) / 10).toLocaleString('es-AR')} s` : '—'}</span>; } },
    { key: 'notes', header: 'Notas', cell: r => r.notes && r.notes.length > 0 ? <span className="block max-w-[260px] truncate text-xs" title={r.notes.join('\n')}>{r.notes.length} nota{r.notes.length === 1 ? '' : 's'}: {r.notes[0]}</span> : <span className="text-xs text-muted-foreground">—</span> },
  ];

  const chips: FilterChip[] = [
    { value: 'pending', label: 'Pendientes', count: tabCounts.pending },
    { value: 'resolved', label: 'Resueltas', count: tabCounts.resolved },
    { value: 'runs', label: 'Corridas', count: tabCounts.runs },
  ];
  const reasonOptions = REASONS.map(r => ({ value: r, label: `${REASON_LABELS[r]}${typeof reasonCounts[r] === 'number' ? ` (${reasonCounts[r]})` : ''}` }));
  const totalChecked = lastRun ? (lastRun.checkedOrders ?? 0) + (lastRun.checkedPayments ?? 0) : null;

  return (
    <AdminPage
      title="Conciliación MP"
      subtitle="Pagos de MercadoPago que no coinciden con el pedido (el webhook y la conciliación diaria los dejan acá en vez de marcarlos a ciegas) y el historial de corridas."
      crumbs={[{ label: 'Finanzas' }, { label: 'Conciliación MP' }]}
      actions={isFullAdmin ? (
        <Button type="button" size="sm" className="h-9 gap-1.5" onClick={handleReconcile} disabled={reconciling} data-testid="reconcile-now">
          <RefreshCw className={cn('h-4 w-4', reconciling && 'animate-spin')} aria-hidden="true" /> {reconciling ? 'Conciliando…' : 'Conciliar ahora'}
        </Button>
      ) : undefined}
      kpis={
        <KpiRow cols={4}>
          <KpiCard testId="kpi-mm-open" label="Discrepancias abiertas" value={tabCounts.pending} tone={tabCounts.pending ? 'destructive' : 'success'} hint={tabCounts.pending ? 'plata sin conciliar: resolver con nota' : 'todo cuadra'} />
          <KpiCard testId="kpi-last-run" label="Última conciliación" value={lastRun === undefined ? null : lastRun ? fmtDate(lastRun.finishedAt ?? lastRun.startedAt, 'short') : 'nunca'} format="text"
            hint={lastRun ? `${lastRun.source === 'cron' ? 'automática' : 'manual'} · ${totalChecked} revisados · ${lastRun.repaired ?? 0} reparados · ${lastRun.flagged ?? 0} marcados${lastRun.errors ? ` · ${lastRun.errors} errores` : ''}` : 'corre sola a diario a las 13:30 UTC (10:30 ART)'} staleAt={lastRun ? toMillis(lastRun.finishedAt ?? lastRun.startedAt) : null} />
          <KpiCard testId="kpi-runs" label="Corridas registradas" value={tabCounts.runs} hint="una por día (cron 13:30 UTC) + las manuales" />
          <KpiCard testId="kpi-mm-resolved" label="Resueltas (histórico)" value={tabCounts.resolved} tone="success" hint="cada una con su nota de cómo se cerró" />
        </KpiRow>
      }
      filters={
        <FilterBar
          chips={chips} chipValue={tab} chipDefault="pending" onChipChange={(v) => setTab(v as Tab)}
          selects={tab === 'runs' ? [] : [{ key: 'reason', label: 'Motivo', options: reasonOptions, value: reason, onChange: setReason, allLabel: 'Todos los motivos' }]}
          onClear={() => { setReason('all'); }}
        />
      }
    >
      {runSummary && (
        <section className="rounded-lg border border-info/40 bg-info/10 p-3 text-sm" data-testid="run-summary">
          <p className="flex items-center gap-2 font-medium"><ScanSearch className="h-4 w-4 text-info-ink" aria-hidden="true" /> Corrida recién disparada: {(runSummary.checkedOrders ?? 0) + (runSummary.checkedPayments ?? 0)} revisados · {runSummary.repaired ?? 0} reparados · {runSummary.flagged ?? 0} marcados · cierres diarios actualizados: {runSummary.daysUpdated ?? 0}{runSummary.monthsUpdated?.length ? ` · meses: ${runSummary.monthsUpdated.join(', ')}` : ''}</p>
          {runSummary.notes && runSummary.notes.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{runSummary.notes.slice(0, 8).map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </section>
      )}

      {tab === 'runs' ? (
        <DataTable<RunRow>
          testId="runs-table"
          columns={runColumns}
          rows={runs.rows}
          rowKey={r => r.id}
          noun="corridas"
          loading={runs.loading}
          error={runs.error}
          onRetry={reloadAll}
          refreshedAt={runs.refreshedAt}
          pagination={{ page: runs.page, pageSize: PAGE_SIZE, total: runs.total, hasMore: runs.hasMore, hasPrev: runs.hasPrev, onNext: runs.next, onPrev: runs.prev, rangeFrom: runs.rangeFrom, rangeTo: runs.rangeTo }}
          onExportCsv={async () => { const { rows, capped } = await runs.exportAll(5000); return { capped, rows: rows.map(r => ({ Inicio: fmtDate(r.startedAt, 'long'), Fin: fmtDate(r.finishedAt, 'long'), Fuente: r.source ?? '', Por: r.byUid ?? '', Estado: r.status ?? '', 'Pedidos revisados': r.checkedOrders ?? 0, 'Pagos revisados': r.checkedPayments ?? 0, OK: r.ok ?? 0, Reparados: r.repaired ?? 0, Marcados: r.flagged ?? 0, 'Sin ID de MP': r.unverifiable ?? 0, Errores: r.errors ?? 0, Notas: (r.notes ?? []).join(' | ') })) }; }}
          csvFilename="conciliaciones.csv"
          getMobileCard={r => ({ title: fmtDate(r.startedAt, 'short'), badge: <span className="text-xs text-muted-foreground">{r.source === 'cron' ? 'automática' : 'manual'}</span>, secondary: `${(r.checkedOrders ?? 0) + (r.checkedPayments ?? 0)} revisados · ${r.repaired ?? 0} reparados · ${r.flagged ?? 0} marcados${r.errors ? ` · ${r.errors} errores` : ''}`, right: r.status === 'running' ? 'sin terminar' : 'ok' })}
          empty={{ icon: ScanSearch, title: 'Todavía no corrió ninguna conciliación', description: 'Corre sola una vez por día; también podés dispararla con "Conciliar ahora".' }}
        />
      ) : (
        <DataTable<MismatchRow>
          testId="mismatches-table"
          columns={mmColumns}
          rows={mm.rows}
          rowKey={m => m.id}
          noun="discrepancias"
          loading={mm.loading}
          error={mm.error}
          onRetry={reloadAll}
          refreshedAt={mm.refreshedAt}
          pagination={{ page: mm.page, pageSize: PAGE_SIZE, total: mm.total, hasMore: mm.hasMore, hasPrev: mm.hasPrev, onNext: mm.next, onPrev: mm.prev, rangeFrom: mm.rangeFrom, rangeTo: mm.rangeTo }}
          onExportCsv={async () => { const { rows, capped } = await mm.exportAll(5000); return { capped, rows: rows.map(m => ({ Fecha: fmtDate(m.createdAt, 'long'), Motivo: reasonLabel(m.reason), Pedido: m.orderId, 'Pago MP': String(m.paymentId ?? ''), 'Pagado': m.paidAmount ?? '', 'Total pedido': m.orderTotal ?? '', 'Estado MP': m.mpStatus ?? '', Origen: m.source ?? 'webhook', Resuelta: m.resolved ? 'sí' : 'no', 'Resuelta el': fmtDate(m.resolvedAt, 'long'), 'Resuelta por': m.resolvedBy ?? '', Nota: m.resolutionNote ?? '' })) }; }}
          csvFilename={`discrepancias_${tab}.csv`}
          rowActions={rowActions}
          rowClassName={m => (m.resolved ? undefined : 'bg-destructive/5')}
          getMobileCard={m => ({ title: <EntityLink type="order" id={m.orderId} />, badge: <StatusBadge kind="mismatch" value={m.reason} resolved={m.resolved} />, secondary: `${fmtDate(m.createdAt, 'short')} · ${stubs[m.orderId]?.customerName || '—'} · ${stubs[m.orderId]?.storeName || '—'}`, right: money(m.paidAmount) })}
          empty={tab === 'pending'
            ? { icon: CheckCircle2, title: 'Sin discrepancias pendientes', description: reason !== 'all' ? 'No hay abiertas con ese motivo.' : 'Todo en orden: cada pago de MP coincide con su pedido.' }
            : { icon: AlertCircle, title: 'Todavía no resolviste ninguna', description: 'Las discrepancias cerradas quedan acá con su nota, para rastrear qué se hizo con esa plata.' }}
        />
      )}

      <p className="text-xs text-muted-foreground">Topes de cada corrida: 300 pedidos pagados de los últimos 30 días y 200 pagos de MP de los últimos 7 (con más volumen pasa a cursor incremental). Lo único que la conciliación repara sola es el <strong>webhook perdido</strong> (pago aprobado en MP + pedido esperando pago + monto ±$1); todo lo demás queda acá para que lo resuelvas con nota. El dinero nunca sale solo: reembolsar sigue siendo una decisión tuya, caso por caso.</p>
      <RefundDialog order={refundTarget?.order ?? null} onOpenChange={(o) => { if (!o) setRefundTarget(null); }} onDone={reloadAll} />
    </AdminPage>
  );
}

export default function AdminPaymentIssuesPage() {
  return <AdminAuthGuard><PaymentIssuesInner /></AdminAuthGuard>;
}
