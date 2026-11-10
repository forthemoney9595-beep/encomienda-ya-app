'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, startAfter, Timestamp, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { CalendarRange, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { money } from '@/lib/format-money';
import { fmtDate } from '@/lib/format-date';
import { downloadCsv } from '@/lib/csv-export';
import { platformNetForOrder, type MoneyOrder } from '@/lib/money';
import { dayStartART, sumDailyBuckets, type DailyBucket } from '@/lib/platform-daily';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PctBadge } from '@/components/pct-badge';
import { EntityLink } from '@/components/admin/entity-link';
import { ErrorState } from '@/components/admin/error-state';
import { StatusBadge } from '@/components/admin/status-badge';

interface MonthRow {
  id: string; year: number; month: number; current?: boolean;
  platform: number; serviceFees: number; commissions: number; toStores: number; toDrivers: number; revenue: number; orders: number;
}
interface TxRow { id: string; createdAt: unknown; customerName?: string; storeName?: string; total?: number; refunded?: boolean; refundAmount?: number; appNet: number }

const TX_PAGE = 25;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthLabel = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;
const monthStart = (y: number, m: number) => dayStartART(`${y}-${String(m).padStart(2, '0')}-01`);
const nextMonthStart = (y: number, m: number) => (m === 12 ? monthStart(y + 1, 1) : monthStart(y, m + 1));

/**
 * Historial mensual (Fase OO ter, migrado al estilo T2): cierres precalculados de
 * `platform_monthly` (≤ 24 lecturas) + el MES EN CURSO armado desde los cierres DIARIOS de
 * este mes + el día de hoy en vivo (antes bajaba todos los entregados del mes en cada visita).
 * Cada fila se expande y recién ahí baja los pedidos de ESE mes, de a 25 con cursor.
 */
export function MonthlyHistory({ today, todayId, fallbackRate }: { today: DailyBucket | null; todayId: string; fallbackRate: number }) {
  const [rows, setRows] = useState<MonthRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const closedSnap = await getDocs(query(collection(db, 'platform_monthly'), orderBy('ym', 'desc'), limit(24)));
        const closed = closedSnap.docs.map(d => ({ id: d.id, ...d.data() }) as MonthRow);
        // Mes en curso: cierres diarios desde el 1° hasta ayer + hoy en vivo.
        const [y, m] = todayId.split('-').map(Number);
        const firstId = `${y}-${String(m).padStart(2, '0')}-01`;
        const dailySnap = firstId < todayId
          ? await getDocs(query(collection(db, 'platform_daily'), where('ymd', '>=', firstId), where('ymd', '<', todayId)))
          : null;
        const sum = sumDailyBuckets([...(dailySnap?.docs.map(d => d.data() as DailyBucket) ?? []), today]);
        const currentRow: MonthRow = { id: `${y}-${String(m).padStart(2, '0')}`, year: y, month: m, current: true, platform: sum.platform, serviceFees: sum.serviceFees, commissions: sum.commissions, toStores: sum.toStores, toDrivers: sum.toDrivers, revenue: sum.revenue, orders: sum.delivered };
        if (!cancelled) { setRows([currentRow, ...closed.filter(c => c.id !== currentRow.id)]); setError(null); }
      } catch (e) {
        if (!cancelled) { console.error('[monthly-history]', e); setError(e); }
      }
    })();
    return () => { cancelled = true; };
  }, [today, todayId, tick]);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [tx, setTx] = useState<Record<string, { rows: TxRow[]; cursor: QueryDocumentSnapshot | null; hasMore: boolean }>>({});
  const [txLoading, setTxLoading] = useState<string | null>(null);

  const loadTx = async (row: MonthRow, more = false) => {
    const prev = tx[row.id];
    if (more && (!prev || !prev.hasMore)) return;
    setTxLoading(row.id);
    try {
      const cons = [
        where('status', '==', 'Entregado'),
        where('createdAt', '>=', Timestamp.fromDate(monthStart(row.year, row.month))),
        where('createdAt', '<', Timestamp.fromDate(nextMonthStart(row.year, row.month))),
        orderBy('createdAt', 'desc'),
        ...(more && prev?.cursor ? [startAfter(prev.cursor)] : []),
        limit(TX_PAGE),
      ];
      const snap = await getDocs(query(collection(db, 'orders'), ...cons));
      const next: TxRow[] = snap.docs.map(d => {
        const o = d.data() as MoneyOrder & { createdAt?: unknown; customerName?: string; storeName?: string };
        return { id: d.id, createdAt: o.createdAt, customerName: o.customerName, storeName: o.storeName, total: o.total, refunded: o.refunded, refundAmount: o.refundAmount, appNet: platformNetForOrder(o, fallbackRate) };
      });
      setTx(s => ({ ...s, [row.id]: { rows: more && prev ? [...prev.rows, ...next] : next, cursor: snap.docs[snap.docs.length - 1] ?? null, hasMore: snap.docs.length === TX_PAGE } }));
    } catch (e) {
      console.error('[monthly-history] desglose:', e);
    } finally {
      setTxLoading(null);
    }
  };

  const toggle = (row: MonthRow) => {
    if (expanded === row.id) { setExpanded(null); return; }
    setExpanded(row.id);
    if (!tx[row.id]) void loadTx(row);
  };

  const exportCsv = () => {
    if (!rows) return;
    downloadCsv(rows.map(r => ({ Mes: r.id, 'En curso': r.current ? 'sí' : '', 'Pedidos entregados': r.orders, 'Facturado bruto': Math.round(r.revenue), 'Tarifas de servicio': Math.round(r.serviceFees), Comisiones: Math.round(r.commissions), 'Neto de la app': Math.round(r.platform), 'A tiendas': Math.round(r.toStores), 'A repartidores': Math.round(r.toDrivers) })), `ganancias_mensuales_${todayId}.csv`);
  };

  const th = 'whitespace-nowrap border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  const td = 'h-11 border-b border-border px-3 align-middle tabular-nums';

  return (
    <section className="min-w-0 overflow-hidden glass rounded-card" data-testid="monthly-history">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><CalendarRange className="h-4 w-4 text-primary-ink" aria-hidden="true" /> Historial mensual</h2>
          <p className="text-xs text-muted-foreground">Cierres precalculados por el cron de conciliación · tocá un mes para ver sus pedidos. El mes en curso se calcula en vivo.</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportCsv} disabled={!rows || rows.length === 0}><Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV</Button>
      </div>
      {error ? <ErrorState error={error} onRetry={() => setTick(t => t + 1)} /> : rows === null ? (
        <div className="flex justify-center py-8" aria-busy="true"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]" data-testid="monthly-table">
            <thead>
              <tr>
                <th className={cn(th, 'text-left')}>Mes</th>
                <th className={cn(th, 'text-right')}>Entregados</th>
                <th className={cn(th, 'text-right')}>Facturado</th>
                <th className={cn(th, 'text-right')}>Tarifas</th>
                <th className={cn(th, 'text-right')}>Comisiones</th>
                <th className={cn(th, 'text-right')}>Neto app</th>
                <th className={cn(th, 'text-right')}>vs mes anterior</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const prev = rows[i + 1];
                const open = expanded === r.id;
                const t = tx[r.id];
                return (
                  <MonthRowView key={r.id} r={r} prev={prev} open={open} t={t} busy={txLoading === r.id} onToggle={() => toggle(r)} onMore={() => loadTx(r, true)} td={td} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MonthRowView({ r, prev, open, t, busy, onToggle, onMore, td }: {
  r: MonthRow; prev?: MonthRow; open: boolean; t?: { rows: TxRow[]; hasMore: boolean }; busy: boolean; onToggle: () => void; onMore: () => void; td: string;
}) {
  return (
    <>
      <tr className="cursor-pointer transition-colors hover:bg-admin-row-hover" onClick={onToggle} data-month={r.id} aria-expanded={open}>
        <td className={cn(td, 'text-left capitalize')}>
          <span className="flex min-h-[36px] items-center gap-1.5">
            {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
            {monthLabel(r.year, r.month)}
            {r.current && <span className="inline-flex h-[22px] items-center rounded-full bg-primary/15 px-2 text-xs font-semibold normal-case text-primary-ink">en curso</span>}
          </span>
        </td>
        <td className={cn(td, 'text-right')}>{r.orders}</td>
        <td className={cn(td, 'text-right text-muted-foreground')}>{money(r.revenue)}</td>
        <td className={cn(td, 'text-right')}>{money(r.serviceFees)}</td>
        <td className={cn(td, 'text-right')}>{money(r.commissions)}</td>
        <td className={cn(td, 'text-right font-semibold text-primary-ink')}>{money(r.platform)}</td>
        <td className={cn(td, 'text-right')}>
          <span className="flex justify-end">
            {/* El mes en curso NO se compara contra un mes cerrado: días parciales vs mes entero
                es el ▼94 % falso de la Fase OO ter. Su comparación justa es "Este mes" arriba. */}
            {r.current ? <span className="text-xs text-muted-foreground">ver &quot;Este mes&quot; ↑</span> : prev ? <PctBadge current={r.platform} prev={prev.platform} /> : <span className="text-xs text-muted-foreground">—</span>}
          </span>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="border-b border-border bg-muted/20 px-3 pb-3 pt-1">
            <div className="mb-2 text-xs text-muted-foreground">Repartido: {money(r.toStores)} a tiendas · {money(r.toDrivers)} a repartidores.</div>
            {!t && busy && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" /></div>}
            {t && t.rows.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Sin pedidos entregados este mes.</p>}
            {t && t.rows.length > 0 && (
              <div className="divide-y divide-foreground/10 rounded-xl border border-foreground/10 bg-foreground/[0.02]">
                {t.rows.map(x => (
                  <div key={x.id} className="flex min-h-[40px] flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-xs">
                    <span className="w-24 shrink-0 whitespace-nowrap text-muted-foreground">{fmtDate(x.createdAt, 'short')}</span>
                    <EntityLink type="order" id={x.id} />
                    <span className="truncate">{x.customerName || 'Cliente'}</span>
                    <span className="truncate text-muted-foreground">· {x.storeName || '—'}</span>
                    {x.refunded && <StatusBadge kind="payment" value="refunded" suffix={money(x.refundAmount)} />}
                    <span className="ml-auto whitespace-nowrap tabular-nums text-muted-foreground">venta {money(x.total)}</span>
                    <span className={cn('w-20 whitespace-nowrap text-right font-semibold tabular-nums', x.appNet > 0 ? 'text-primary-ink' : 'text-muted-foreground')}>+{money(x.appNet)}</span>
                  </div>
                ))}
                {t.hasMore && (
                  <div className="flex justify-center p-2">
                    <Button type="button" variant="ghost" size="sm" className="h-9" onClick={(e) => { e.stopPropagation(); onMore(); }} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : `Cargar ${TX_PAGE} más`}</Button>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
