'use client';

import { useCallback, useMemo } from 'react';
import { collection, limit, orderBy, query, startAfter, type Query, type QueryDocumentSnapshot } from 'firebase/firestore';
import { Undo2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { money } from '@/lib/format-money';
import { fmtDate } from '@/lib/format-date';
import AdminAuthGuard from '../../admin-auth-guard';
import { AdminPage } from '@/components/admin/admin-page';
import { DataTable, type DataColumn } from '@/components/admin/data-table';
import { usePagedQuery } from '@/components/admin/use-paged-query';
import { EntityLink } from '@/components/admin/entity-link';

const PAGE_SIZE = 25;

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
}

/**
 * Reembolsos (NUEVA, Tanda T1 — versión mínima; la spec la ubica en T2 con KPIs del período y
 * filtro por tienda). La colección `refunds` existía SIN pantalla: solo se veía como badge en el
 * pedido y en el reclamo. Solo lectura: el reembolso se registra desde el pedido o el reclamo.
 */
function RefundsInner() {
  const { isAdmin } = useAuth();
  const col = useMemo(() => collection(db, 'refunds'), []);
  const build = useCallback((cursor: QueryDocumentSnapshot | null, size: number): Query | null =>
    isAdmin ? query(col, orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(size)) : null, [isAdmin, col]);
  const countQuery = useMemo(() => (isAdmin ? query(col) : null), [isAdmin, col]);
  const paged = usePagedQuery<RefundRow>({ build, countQuery, pageSize: PAGE_SIZE, enabled: isAdmin });

  const columns: DataColumn<RefundRow>[] = [
    { key: 'date', header: 'Fecha', width: '120px', cell: r => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{fmtDate(r.createdAt, 'short')}</span> },
    { key: 'order', header: 'Pedido', cell: r => <EntityLink type="order" id={r.orderId} /> },
    { key: 'buyer', header: 'Cliente', cell: r => <EntityLink type="user" id={r.buyerId} label={r.buyerId ? r.buyerId.slice(0, 8) : '—'} quick /> },
    { key: 'store', header: 'Tienda', cell: r => <EntityLink type="store" id={r.storeId ?? undefined} label={r.storeId ? r.storeId.slice(0, 8) : '—'} /> },
    { key: 'amount', header: 'Monto', align: 'right', cell: r => <span className="font-medium">{money(r.amount)}</span> },
    { key: 'reason', header: 'Motivo', cell: r => <span className="block max-w-[260px] truncate text-muted-foreground" title={r.reason}>{r.reason || '—'}</span> },
    { key: 'op', header: 'Comprobante', cell: r => <span className="font-mono text-xs">{r.operationRef || '—'}</span> },
    { key: 'claim', header: 'Reclamo', cell: r => r.claimId ? <span className="inline-flex h-[22px] items-center rounded-full bg-warning/15 px-2 text-xs font-semibold text-warning-ink">desde reclamo</span> : <span className="text-muted-foreground">—</span> },
  ];

  return (
    <AdminPage title="Reembolsos" subtitle="Registro de devoluciones al comprador (solo lectura). Se registran desde la ficha del pedido o desde el reclamo." crumbs={[{ label: 'Finanzas' }, { label: 'Reembolsos' }]}>
      <DataTable<RefundRow>
        columns={columns}
        rows={paged.rows}
        rowKey={r => r.id}
        noun="reembolsos"
        loading={paged.loading}
        error={paged.error}
        onRetry={paged.reload}
        refreshedAt={paged.refreshedAt}
        pagination={{ page: paged.page, pageSize: PAGE_SIZE, total: paged.total, hasMore: paged.hasMore, hasPrev: paged.hasPrev, onNext: paged.next, onPrev: paged.prev, rangeFrom: paged.rangeFrom, rangeTo: paged.rangeTo }}
        onExportCsv={async () => {
          const { rows, capped } = await paged.exportAll(5000);
          return { capped, rows: rows.map(r => ({ Fecha: fmtDate(r.createdAt, 'long'), Pedido: r.orderId, Cliente: r.buyerId ?? '', Tienda: r.storeId ?? '', Monto: r.amount, Motivo: r.reason ?? '', Comprobante: r.operationRef ?? '', Admin: r.adminUid ?? '', Reclamo: r.claimId ?? '' })) };
        }}
        csvFilename="reembolsos.csv"
        getMobileCard={r => ({ title: <EntityLink type="order" id={r.orderId} />, secondary: `${fmtDate(r.createdAt, 'short')} · op. ${r.operationRef || '—'}`, right: money(r.amount) })}
        empty={{ icon: Undo2, title: 'Todavía no hay reembolsos registrados', description: 'Cuando registres una devolución desde un pedido o un reclamo, aparece acá.' }}
      />
    </AdminPage>
  );
}

export default function AdminRefundsPage() {
  return <AdminAuthGuard requireFullAdmin><RefundsInner /></AdminAuthGuard>;
}
