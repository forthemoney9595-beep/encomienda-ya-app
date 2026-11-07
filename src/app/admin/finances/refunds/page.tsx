'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection, count, getDocs, limit, orderBy, query, startAfter, sum, Timestamp, where,
  type Query, type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { subDays, startOfMonth } from 'date-fns';
import { Undo2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { db, useMemoFirebase } from '@/lib/firebase';
import { useAggregate } from '@/lib/firebase-aggregate';
import { money } from '@/lib/format-money';
import { fmtDate } from '@/lib/format-date';
import AdminAuthGuard from '../../admin-auth-guard';
import { AdminPage } from '@/components/admin/admin-page';
import { KpiCard, KpiRow } from '@/components/admin/kpi-card';
import { FilterBar, type DateRangePreset } from '@/components/admin/filter-bar';
import { DataTable, type DataColumn } from '@/components/admin/data-table';
import { usePagedQuery } from '@/components/admin/use-paged-query';
import { EntityLink } from '@/components/admin/entity-link';

const PAGE_SIZE = 25;
const ORDER_ID_MIN_LEN = 15;

interface RefundRow {
  id: string;
  orderId: string;
  buyerId?: string;
  storeId?: string | null;
  amount: number;
  reason?: string;
  operationRef?: string;
  adminUid?: string;
  claimId?: string;
  createdAt?: unknown;
  /** Quién absorbió el reembolso (Fase YY bis). Sin el campo = proporcional (los anteriores). */
  allocation?: { store: number; driver: number; platform: number };
  allocationPreset?: string;
}

const PRESET_LABEL: Record<string, string> = {
  proportional: 'Proporcional', store: 'La tienda', driver: 'El repartidor', platform: 'La plataforma', custom: 'Personalizado',
};
/** "Tienda $X · Repartidor $Y · Plataforma $Z" (solo las partes que absorbieron algo). */
function allocationText(r: RefundRow): string {
  if (!r.allocation) return 'Proporcional (anterior)';
  const parts = ([['store', 'Tienda'], ['driver', 'Repartidor'], ['platform', 'Plataforma']] as const)
    .filter(([k]) => (r.allocation![k] || 0) > 0).map(([k, l]) => `${l} ${money(r.allocation![k])}`);
  return parts.join(' · ') || '—';
}

function dateFrom(f: DateRangePreset): Date | null {
  if (f === 'all') return null;
  if (f === '7d') return subDays(new Date(), 7);
  if (f === '30d') return subDays(new Date(), 30);
  return startOfMonth(new Date());
}

/**
 * Reembolsos (Tanda T2, full). La colección `refunds` existía SIN pantalla. Solo lectura: el
 * reembolso se registra desde la ficha del pedido o desde el reclamo con el `RefundDialog`
 * único. Filtros SERVER-SIDE: fecha (`createdAt >=`), tienda (índice `refunds (storeId,
 * createdAt↓)`) y búsqueda por ID EXACTO de pedido en toda la base (`where orderId ==`, sin
 * orderBy → sin índice extra). KPIs del filtro por aggregation (índice `(createdAt, amount)`).
 */
function RefundsInner() {
  const { isFullAdmin } = useAuth();
  const [date, setDate] = useState<DateRangePreset>('all');
  const [storeId, setStoreId] = useState('all');
  const [search, setSearch] = useState('');
  const col = useMemo(() => collection(db, 'refunds'), []);
  const fromTs = useMemo(() => { const d = dateFrom(date); return d ? Timestamp.fromDate(d) : null; }, [date]);
  const idSearch = search.trim().length >= ORDER_ID_MIN_LEN ? search.trim() : null;

  // Tiendas para el select y para rotular la columna (colección acotada, una vez).
  const [stores, setStores] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!isFullAdmin) return;
    let cancelled = false;
    getDocs(collection(db, 'stores')).then(s => { if (!cancelled) setStores(s.docs.map(d => ({ value: d.id, label: String(d.data().name || d.id) })).sort((a, b) => a.label.localeCompare(b.label))); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isFullAdmin]);
  const storeName = useCallback((id?: string | null) => (id ? stores.find(s => s.value === id)?.label ?? id.slice(0, 8) : '—'), [stores]);

  const baseConstraints = useCallback((): QueryConstraint[] => {
    const c: QueryConstraint[] = [];
    if (storeId !== 'all') c.push(where('storeId', '==', storeId));
    if (fromTs) c.push(where('createdAt', '>=', fromTs));
    return c;
  }, [storeId, fromTs]);

  const build = useCallback((cursor: QueryDocumentSnapshot | null, size: number): Query | null => {
    if (!isFullAdmin) return null;
    // ID exacto: busca en TODA la base, sin filtros ni orden (≤ un puñado de docs por pedido).
    if (idSearch) return cursor ? null : query(col, where('orderId', '==', idSearch), limit(size));
    return query(col, ...baseConstraints(), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(size));
  }, [isFullAdmin, col, baseConstraints, idSearch]);
  const countQuery = useMemo(() => (isFullAdmin ? (idSearch ? query(col, where('orderId', '==', idSearch)) : query(col, ...baseConstraints())) : null), [isFullAdmin, col, baseConstraints, idSearch]);
  const paged = usePagedQuery<RefundRow>({ build, countQuery, pageSize: PAGE_SIZE, enabled: isFullAdmin });

  // KPIs del filtro: cantidad + monto. Con filtro de tienda no hay índice (storeId, createdAt, amount) → solo cantidad.
  const aggQ = useMemoFirebase(() => (isFullAdmin && !idSearch && storeId === 'all' ? query(col, ...baseConstraints()) : null), [isFullAdmin, col, baseConstraints, idSearch, storeId]);
  const agg = useAggregate(aggQ, { total: sum('amount'), n: count() });

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t || idSearch) return paged.rows;
    return paged.rows.filter(r => r.orderId.toLowerCase().includes(t) || (r.reason || '').toLowerCase().includes(t) || (r.operationRef || '').toLowerCase().includes(t));
  }, [paged.rows, search, idSearch]);

  const columns: DataColumn<RefundRow>[] = [
    { key: 'date', header: 'Fecha', width: '120px', cell: r => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{fmtDate(r.createdAt, 'short')}</span> },
    { key: 'order', header: 'Pedido', cell: r => <EntityLink type="order" id={r.orderId} /> },
    { key: 'buyer', header: 'Cliente', cell: r => <EntityLink type="user" id={r.buyerId} label={r.buyerId ? r.buyerId.slice(0, 8) : '—'} quick /> },
    { key: 'store', header: 'Tienda', cell: r => <EntityLink type="store" id={r.storeId ?? undefined} label={storeName(r.storeId)} /> },
    { key: 'amount', header: 'Monto', align: 'right', cell: r => <span className="font-semibold">{money(r.amount)}</span> },
    { key: 'absorbs', header: 'Quién absorbe', cell: r => (
      <div className="min-w-[150px]" data-testid="refund-absorbs">
        <div className="text-sm">{r.allocation ? (PRESET_LABEL[r.allocationPreset || 'custom'] || 'Personalizado') : <span className="text-muted-foreground">Proporcional</span>}</div>
        <div className="text-xs text-muted-foreground">{r.allocation ? allocationText(r) : 'registrado antes de elegir quién absorbe'}</div>
      </div>
    ) },
    { key: 'reason', header: 'Motivo', cell: r => <span className="block max-w-[260px] truncate text-muted-foreground" title={r.reason}>{r.reason || '—'}</span> },
    { key: 'op', header: 'Comprobante', cell: r => <span className="font-mono text-xs">{r.operationRef || '—'}</span> },
    { key: 'admin', header: 'Admin', cell: r => <EntityLink type="user" id={r.adminUid} label={r.adminUid ? r.adminUid.slice(0, 8) : '—'} quick /> },
    { key: 'claim', header: 'Reclamo', cell: r => r.claimId
      ? <EntityLink type="order" id={r.orderId} label={<span className="inline-flex h-[22px] items-center rounded-full bg-warning/15 px-2 font-sans text-xs font-semibold text-warning-ink">desde reclamo</span>} className="font-sans" />
      : <span className="text-muted-foreground">—</span> },
  ];

  return (
    <AdminPage
      title="Reembolsos"
      subtitle="Registro de devoluciones al comprador (solo lectura). Se registran desde la ficha del pedido o desde el reclamo, siempre después de devolver en MercadoPago."
      crumbs={[{ label: 'Finanzas' }, { label: 'Reembolsos' }]}
      kpis={
        <KpiRow cols={4}>
          <KpiCard testId="kpi-refunds-n" label="Reembolsos del filtro" value={idSearch ? paged.total : paged.total} error={paged.countError} onRetry={paged.reload} hint={idSearch ? 'por ID de pedido' : date === 'all' ? 'todo el historial' : 'en el período'} />
          <KpiCard testId="kpi-refunds-sum" label="Monto devuelto" value={aggQ ? (agg.error ? '—' : agg.data ? agg.data.total : null) : '—'} format={aggQ && !agg.error ? 'money' : 'text'} tone="warning" error={agg.error} onRetry={agg.refresh}
            hint={aggQ ? 'suma del filtro · descontado del saldo de quien lo absorbió' : 'no disponible con filtro de tienda o búsqueda por ID'} />
        </KpiRow>
      }
      filters={
        <FilterBar
          dateRange={{ value: date, onChange: setDate, defaultValue: 'all' }}
          selects={[{ key: 'store', label: 'Tienda', options: stores, value: storeId, onChange: setStoreId, allLabel: 'Todas las tiendas' }]}
          search={{ value: search, onChange: setSearch, placeholder: 'ID de pedido, motivo o comprobante', scope: 'mixed',
            hint: idSearch ? 'Buscando por ID exacto de pedido en toda la base (ignora fecha y tienda).' : 'Un ID de pedido completo busca en toda la base. Motivo/comprobante filtran solo esta página.' }}
          onClear={() => { setDate('all'); setStoreId('all'); setSearch(''); }}
        />
      }
    >
      <DataTable<RefundRow>
        testId="refunds-table"
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        noun="reembolsos"
        loading={paged.loading}
        error={paged.error}
        onRetry={paged.reload}
        refreshedAt={paged.refreshedAt}
        pagination={{ page: paged.page, pageSize: PAGE_SIZE, total: paged.total, hasMore: paged.hasMore, hasPrev: paged.hasPrev, onNext: paged.next, onPrev: paged.prev, rangeFrom: paged.rangeFrom, rangeTo: paged.rangeTo }}
        onExportCsv={async () => {
          const { rows: all, capped } = await paged.exportAll(5000);
          return { capped, rows: all.map(r => ({ Fecha: fmtDate(r.createdAt, 'long'), Pedido: r.orderId, Cliente: r.buyerId ?? '', Tienda: storeName(r.storeId), 'ID tienda': r.storeId ?? '', Monto: r.amount, 'Quién absorbe': r.allocation ? (PRESET_LABEL[r.allocationPreset || 'custom'] || 'Personalizado') : 'Proporcional (anterior)', 'Absorbe tienda': r.allocation?.store ?? '', 'Absorbe repartidor': r.allocation?.driver ?? '', 'Absorbe plataforma': r.allocation?.platform ?? '', Motivo: r.reason ?? '', Comprobante: r.operationRef ?? '', Admin: r.adminUid ?? '', Reclamo: r.claimId ?? '' })) };
        }}
        csvFilename={`reembolsos_${fmtDate(Date.now(), 'date').replace(/\//g, '-')}.csv`}
        getMobileCard={r => ({ title: <EntityLink type="order" id={r.orderId} />, secondary: `${fmtDate(r.createdAt, 'short')} · ${storeName(r.storeId)} · op. ${r.operationRef || '—'} · ${allocationText(r)}`, right: money(r.amount), badge: r.claimId ? <span className="inline-flex h-[22px] items-center rounded-full bg-warning/15 px-2 text-xs font-semibold text-warning-ink">reclamo</span> : undefined })}
        empty={{ icon: Undo2, title: idSearch ? 'Ese pedido no tiene reembolsos' : 'Todavía no hay reembolsos registrados', description: idSearch ? 'Verificá el ID o probá sin filtro.' : 'Cuando registres una devolución desde un pedido o un reclamo, aparece acá.' }}
      />
    </AdminPage>
  );
}

export default function AdminRefundsPage() {
  return <AdminAuthGuard requireFullAdmin><RefundsInner /></AdminAuthGuard>;
}
