'use client';

// Ganancias de la PLATAFORMA por período (Fase OO bis/ter) — cuánto ganó la app en sí
// (tarifa de servicio + comisiones), con comparación contra el período anterior y un
// historial mes a mes con desglose de transacciones.
//
// Mismos criterios que el resto de Finanzas:
// - fórmulas SIEMPRE de src/lib/money.ts — acá no se inventa ningún reparto nuevo
// - período acotado con where('createdAt','>=') sobre el índice (status, createdAt);
//   se baja el doble de la ventana para comparar sin segunda query (patrón M3), y el
//   bucket anterior respeta prevTo (para 'month' = mismo TRAMO del mes pasado, no el
//   mes completo — el ▼94% falso de comparar 7 días contra 31)
// - historial mensual: cierres precalculados en `platform_monthly` (un doc por mes,
//   mantenidos por el cron de conciliación) — sin bajar pedidos históricos. Cada fila se
//   expande y recién AHÍ se bajan los pedidos de ESE mes (consulta acotada, bajo demanda)
// - getDocs one-shot, no listener: es una vista de análisis, no un tablero en vivo

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFirestore } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, getDoc, doc, limit, Timestamp } from 'firebase/firestore';
import {
  platformNetForOrder, storeNetForOrder, driverNetForOrder, refundRatio,
  isPlatformCollected, FALLBACK_COMMISSION, type MoneyOrder,
} from '@/lib/money';
import { getPeriodBounds, PERIOD_LABELS, type Period } from '@/lib/analytics-period';
import { PctBadge } from '@/components/pct-badge';
import { Landmark, CalendarRange, ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

type EarningsPeriod = Exclude<Period, 'all'>;
const PERIODS: EarningsPeriod[] = ['7d', '30d', 'month'];

// Meses en hora argentina (UTC-3 fijo) — mismo criterio que src/lib/platform-stats.ts.
const ART_OFFSET_H = 3;
const artMonthStart = (year: number, month0: number): Date =>
  new Date(Date.UTC(year, month0, 1, ART_OFFSET_H, 0, 0));
const nowInART = () => {
  const art = new Date(Date.now() - ART_OFFSET_H * 3600_000);
  return { year: art.getUTCFullYear(), month0: art.getUTCMonth() };
};

interface Bucket {
  platform: number;   // lo de la app: tarifas + comisiones
  serviceFees: number;
  commissions: number;
  toStores: number;   // contexto: cómo se repartió el resto
  toDrivers: number;
  orders: number;
}
const emptyBucket = (): Bucket => ({ platform: 0, serviceFees: 0, commissions: 0, toStores: 0, toDrivers: 0, orders: 0 });

function addToBucket(b: Bucket, o: MoneyOrder, fallbackRate: number) {
  const platform = platformNetForOrder(o, fallbackRate);
  const serviceFee = isPlatformCollected(o) ? (Number(o.serviceFee) || 0) * (1 - refundRatio(o)) : 0;
  b.platform += platform;
  b.serviceFees += serviceFee;
  b.commissions += Math.max(0, platform - serviceFee);
  b.toStores += storeNetForOrder(o, fallbackRate);
  b.toDrivers += driverNetForOrder(o);
  b.orders += 1;
}

interface MonthRow extends Bucket {
  id: string;    // "YYYY-MM"
  year: number;
  month: number; // 1-12
  current?: boolean;
}

// Transacción del desglose de un mes (se baja bajo demanda al expandir la fila).
interface TxRow {
  id: string;
  createdAt: any;
  customerName?: string;
  storeName?: string;
  total?: number;
  refunded?: boolean;
  appNet: number;
}

export function PlatformEarnings() {
  const firestore = useFirestore();
  const [period, setPeriod] = useState<EarningsPeriod>('30d');
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<Bucket>(emptyBucket());
  const [previous, setPrevious] = useState<Bucket>(emptyBucket());
  const [fallbackRate, setFallbackRate] = useState(FALLBACK_COMMISSION);

  // Comisión por defecto para pedidos sin tarifa congelada — mismo fallback que la
  // aprobación de retiros. Una sola vez.
  useEffect(() => {
    if (!firestore) return;
    getDoc(doc(firestore, 'config', 'platform'))
      .then(cfg => {
        const v = Number(cfg.data()?.defaultCommissionRate);
        if (Number.isFinite(v) && v > 0) setFallbackRate(v);
      })
      .catch(() => { /* fallback */ });
  }, [firestore]);

  // ── Período seleccionado (tarjetas de arriba) ──
  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { from, prevFrom, prevTo } = getPeriodBounds(period);
        if (!from || !prevFrom || !prevTo) return;

        const snap = await getDocs(query(
          collection(firestore, 'orders'),
          where('status', '==', 'Entregado'),
          where('createdAt', '>=', Timestamp.fromDate(prevFrom)),
          orderBy('createdAt', 'desc'),
        ));

        const cur = emptyBucket();
        const prev = emptyBucket();
        for (const d of snap.docs) {
          const o = d.data() as MoneyOrder & { createdAt?: any };
          const created = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt as any);
          if (created >= from) addToBucket(cur, o, fallbackRate);
          // El bucket anterior respeta prevTo: para 'month' es el MISMO TRAMO del mes
          // pasado. Antes se metía el mes anterior completo y la comparación mentía.
          else if (created < prevTo) addToBucket(prev, o, fallbackRate);
        }
        if (!cancelled) { setCurrent(cur); setPrevious(prev); }
      } catch (e) {
        console.error('[platform-earnings]', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [firestore, period, fallbackRate]);

  // ── Historial mensual: cierres precalculados + el mes EN CURSO en vivo ──
  const [monthly, setMonthly] = useState<MonthRow[]>([]);
  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;
    (async () => {
      try {
        // Cierres (orden por el CAMPO `ym`: documentId() descendente no es automático).
        const snap = await getDocs(query(
          collection(firestore, 'platform_monthly'), orderBy('ym', 'desc'), limit(24)));
        const closed = snap.docs.map(d => ({ id: d.id, ...d.data() }) as MonthRow);

        // Mes en curso, calculado en vivo (nunca se guarda: cambia todos los días).
        const { year, month0 } = nowInART();
        const curStart = artMonthStart(year, month0);
        const curSnap = await getDocs(query(
          collection(firestore, 'orders'),
          where('status', '==', 'Entregado'),
          where('createdAt', '>=', Timestamp.fromDate(curStart)),
        ));
        const curBucket = emptyBucket();
        curSnap.docs.forEach(d => addToBucket(curBucket, d.data() as MoneyOrder, fallbackRate));
        const currentRow: MonthRow = {
          id: `${year}-${String(month0 + 1).padStart(2, '0')}`,
          year, month: month0 + 1, current: true, ...curBucket,
        };

        if (!cancelled) setMonthly([currentRow, ...closed.filter(c => c.id !== currentRow.id)]);
      } catch (e) {
        console.error('[platform-earnings] historial mensual:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [firestore, fallbackRate]);

  // ── Desglose de un mes: los pedidos de ESE mes, bajo demanda ──
  const [expanded, setExpanded] = useState<string | null>(null);
  const [txCache, setTxCache] = useState<Record<string, TxRow[]>>({});
  const [txLoading, setTxLoading] = useState<string | null>(null);

  const toggleMonth = async (row: MonthRow) => {
    if (expanded === row.id) { setExpanded(null); return; }
    setExpanded(row.id);
    if (txCache[row.id] || !firestore) return;
    setTxLoading(row.id);
    try {
      const start = artMonthStart(row.year, row.month - 1);
      const end = artMonthStart(row.month === 12 ? row.year + 1 : row.year, row.month === 12 ? 0 : row.month);
      const snap = await getDocs(query(
        collection(firestore, 'orders'),
        where('status', '==', 'Entregado'),
        where('createdAt', '>=', Timestamp.fromDate(start)),
        where('createdAt', '<', Timestamp.fromDate(end)),
        orderBy('createdAt', 'desc'),
      ));
      const rows: TxRow[] = snap.docs.map(d => {
        const o = d.data() as any;
        return {
          id: d.id,
          createdAt: o.createdAt,
          customerName: o.customerName,
          storeName: o.storeName,
          total: o.total,
          refunded: o.refunded,
          appNet: platformNetForOrder(o, fallbackRate),
        };
      });
      setTxCache(prev => ({ ...prev, [row.id]: rows }));
    } catch (e) {
      console.error('[platform-earnings] desglose:', e);
    } finally {
      setTxLoading(null);
    }
  };

  const fmtDate = (ts: any) => {
    try { return format(ts?.toDate ? ts.toDate() : new Date(ts), 'd MMM HH:mm', { locale: es }); } catch { return '—'; }
  };

  return (
    <Card className="shadow-md border-primary/30 bg-primary/5">
      <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" /> Ganancias de la plataforma
          </CardTitle>
          <CardDescription>
            Lo que gana la app: tarifa de servicio + comisiones a tiendas, neto de
            reembolsos, sobre pedidos entregados del período.
          </CardDescription>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as EarningsPeriod)}>
          <TabsList className="h-8">
            {PERIODS.map(p => (
              <TabsTrigger key={p} value={p} className="text-xs px-2.5">{PERIOD_LABELS[p]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-2xl font-bold text-primary">{money(current.platform)}</div>
                <div className="text-[11px] text-muted-foreground">Ganancia total</div>
                <PctBadge current={current.platform} prev={previous.platform} />
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-2xl font-bold text-success">{money(current.serviceFees)}</div>
                <div className="text-[11px] text-muted-foreground">Tarifas de servicio</div>
                <PctBadge current={current.serviceFees} prev={previous.serviceFees} />
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-2xl font-bold text-info">{money(current.commissions)}</div>
                <div className="text-[11px] text-muted-foreground">Comisiones a tiendas</div>
                <PctBadge current={current.commissions} prev={previous.commissions} />
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-2xl font-bold">{current.orders}</div>
                <div className="text-[11px] text-muted-foreground">Pedidos entregados</div>
                <PctBadge current={current.orders} prev={previous.orders} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              En el mismo período se repartieron {money(current.toStores)} a tiendas y{' '}
              {money(current.toDrivers)} a repartidores.
              {period === 'month'
                ? ' Comparación contra el mismo tramo del mes pasado (mismos días transcurridos).'
                : ' Comparación contra el período anterior equivalente.'}
            </p>
          </>
        )}

        {/* Historial mensual: mes en curso en vivo + cierres precalculados. Cada fila se
            expande para ver las transacciones de ese mes (consulta acotada bajo demanda). */}
        <div className="pt-2 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5 text-primary" /> Historial mensual
            <span className="text-[11px] font-normal text-muted-foreground">— tocá un mes para ver sus transacciones</span>
          </h4>
          {monthly.length === 0 ? (
            <p className="text-xs text-muted-foreground border-2 border-dashed rounded-lg p-3 text-center">
              Cargando historial…
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Mes</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pedidos</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tarifas</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Comisiones</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ganancia</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">vs mes anterior</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {monthly.map((m, i) => {
                    const prevMonth = monthly[i + 1];
                    const isOpen = expanded === m.id;
                    const txs = txCache[m.id];
                    return (
                      <MonthRows
                        key={m.id}
                        m={m} prevMonth={prevMonth} isOpen={isOpen}
                        txs={txs} txLoading={txLoading === m.id}
                        onToggle={() => toggleMonth(m)}
                        fmtDate={fmtDate}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MonthRows({ m, prevMonth, isOpen, txs, txLoading, onToggle, fmtDate }: {
  m: MonthRow; prevMonth?: MonthRow; isOpen: boolean;
  txs?: TxRow[]; txLoading: boolean; onToggle: () => void;
  fmtDate: (ts: any) => string;
}) {
  return (
    <>
      <tr className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 capitalize whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            {format(new Date(m.year, m.month - 1, 1), 'MMMM yyyy', { locale: es })}
            {m.current && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">en curso</Badge>}
          </span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{m.orders}</td>
        <td className="px-3 py-2 text-right tabular-nums text-success">{money(m.serviceFees)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-info">{money(m.commissions)}</td>
        <td className="px-3 py-2 text-right tabular-nums font-bold text-primary">{money(m.platform)}</td>
        <td className="px-3 py-2">
          <div className="flex justify-end">
            {/* El mes en curso NO se compara contra el cierre completo anterior: sería el
                mismo engaño de días parciales vs mes entero. Su comparación justa está en
                el filtro "Este mes" de arriba. */}
            {m.current
              ? <span className="text-[11px] text-muted-foreground">ver &quot;Este mes&quot; ↑</span>
              : prevMonth
                ? <PctBadge current={m.platform} prev={prevMonth.platform} />
                : <span className="text-xs text-muted-foreground">—</span>}
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={6} className="px-3 pb-3 pt-0 bg-muted/10">
            {txLoading && (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            )}
            {!txLoading && txs && txs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">Sin pedidos entregados este mes.</p>
            )}
            {!txLoading && txs && txs.length > 0 && (
              <div className="rounded-lg border bg-card divide-y divide-border/60 mt-1">
                {txs.map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground whitespace-nowrap w-24 shrink-0">{fmtDate(t.createdAt)}</span>
                    <span className="truncate">{t.customerName || 'Cliente'}</span>
                    <span className="text-muted-foreground truncate">· {t.storeName || '—'}</span>
                    {t.refunded && <Badge variant="outline" className="text-[9px] border-info/40 text-info shrink-0">reembolsado</Badge>}
                    <span className="ml-auto text-muted-foreground tabular-nums whitespace-nowrap">venta {money(t.total || 0)}</span>
                    <span className={cn('font-bold tabular-nums whitespace-nowrap w-20 text-right',
                      t.appNet > 0 ? 'text-primary' : 'text-muted-foreground')}>
                      +{money(t.appNet)}
                    </span>
                    <Link href={`/orders/${t.id}`} target="_blank" className="shrink-0" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0"><ExternalLink className="h-3 w-3" /></Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
