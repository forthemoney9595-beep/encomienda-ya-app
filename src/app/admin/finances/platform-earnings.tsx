'use client';

// Ganancias de la PLATAFORMA por período (Fase OO bis) — la vista que faltaba: cuánto
// ganó la app en sí (tarifa de servicio + comisiones), con comparación contra el período
// anterior. Antes este número vivía repartido entre el desglose del dashboard (histórico
// total, sin período) y la tarjeta "Comisión plat." de cada ficha de tienda.
//
// Mismos criterios que el resto de Finanzas:
// - fórmulas SIEMPRE de src/lib/money.ts (platformNetForOrder y compañía) — acá no se
//   inventa ningún reparto nuevo
// - período acotado con where('createdAt','>=') sobre el índice (status, createdAt) que
//   ya existe (Fase HH); se baja el doble de la ventana para comparar sin segunda query
//   (mismo truco que my-store/analytics, Fase M3) — sin opción "Todo" (regla Fase Z)
// - getDocs one-shot, no listener: es una vista de análisis, no un tablero en vivo

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, getDoc, doc, limit, documentId, Timestamp } from 'firebase/firestore';
import {
  platformNetForOrder, storeNetForOrder, driverNetForOrder, refundRatio,
  isPlatformCollected, FALLBACK_COMMISSION, type MoneyOrder,
} from '@/lib/money';
import { getPeriodBounds, PERIOD_LABELS, type Period } from '@/lib/analytics-period';
import { PctBadge } from '@/components/pct-badge';
import { Landmark, CalendarRange } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

type EarningsPeriod = Exclude<Period, 'all'>;
const PERIODS: EarningsPeriod[] = ['7d', '30d', 'month'];

interface Bucket {
  platform: number;   // lo de la app: tarifas + comisiones
  serviceFees: number;
  commissions: number;
  toStores: number;   // contexto: cómo se repartió el resto
  toDrivers: number;
  orders: number;
}

const emptyBucket = (): Bucket => ({ platform: 0, serviceFees: 0, commissions: 0, toStores: 0, toDrivers: 0, orders: 0 });

interface MonthRow extends Bucket {
  id: string;    // "YYYY-MM"
  year: number;
  month: number; // 1-12
}

export function PlatformEarnings() {
  const firestore = useFirestore();
  const [period, setPeriod] = useState<EarningsPeriod>('30d');
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<Bucket>(emptyBucket());
  const [previous, setPrevious] = useState<Bucket>(emptyBucket());

  // Historial mensual (Fase OO ter): lee los cierres precalculados de `platform_monthly`
  // (un doc chico por mes, mantenidos por el cron de conciliación) — un mes = una
  // lectura, sin bajar pedidos históricos. El id "YYYY-MM" ordena solo.
  const [monthly, setMonthly] = useState<MonthRow[]>([]);
  useEffect(() => {
    if (!firestore) return;
    getDocs(query(collection(firestore, 'platform_monthly'), orderBy(documentId(), 'desc'), limit(24)))
      .then(snap => setMonthly(snap.docs.map(d => ({ id: d.id, ...d.data() }) as MonthRow)))
      .catch(e => console.error('[platform-earnings] historial mensual:', e));
  }, [firestore]);

  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // Comisión por defecto para pedidos sin tarifa congelada (los de antes del
        // backfill de la Fase KK) — mismo fallback que usa la aprobación de retiros.
        let fallbackRate = FALLBACK_COMMISSION;
        try {
          const cfg = await getDoc(doc(firestore, 'config', 'platform'));
          const v = Number(cfg.data()?.defaultCommissionRate);
          if (Number.isFinite(v) && v > 0) fallbackRate = v;
        } catch { /* fallback */ }

        const { from, prevFrom } = getPeriodBounds(period);
        if (!from || !prevFrom) return;

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
          const bucket = created >= from ? cur : prev;

          const platform = platformNetForOrder(o, fallbackRate);
          // Parte "tarifa de servicio" del neto de la plataforma; el resto es comisión.
          const serviceFee = isPlatformCollected(o)
            ? (Number(o.serviceFee) || 0) * (1 - refundRatio(o))
            : 0;
          bucket.platform += platform;
          bucket.serviceFees += serviceFee;
          bucket.commissions += Math.max(0, platform - serviceFee);
          bucket.toStores += storeNetForOrder(o, fallbackRate);
          bucket.toDrivers += driverNetForOrder(o);
          bucket.orders += 1;
        }

        if (!cancelled) { setCurrent(cur); setPrevious(prev); }
      } catch (e) {
        console.error('[platform-earnings]', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [firestore, period]);

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
              {money(current.toDrivers)} a repartidores. Comparación contra el período anterior
              equivalente{previous.orders === 0 ? ' (sin datos previos)' : ''}.
            </p>
          </>
        )}

        {/* Historial mensual: meses CERRADOS precalculados. El mes en curso se mira con
            el filtro "Este mes" de arriba (cambia todos los días, no se congela). */}
        <div className="pt-2 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5 text-primary" /> Historial mensual
          </h4>
          {monthly.length === 0 ? (
            <p className="text-xs text-muted-foreground border-2 border-dashed rounded-lg p-3 text-center">
              Todavía no hay meses cerrados registrados. Se generan solos con el cron diario
              — o al tocar &quot;Conciliar ahora&quot; en Discrepancias de Pago.
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
                    return (
                      <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 capitalize whitespace-nowrap">
                          {format(new Date(m.year, m.month - 1, 1), 'MMMM yyyy', { locale: es })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.orders}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-success">{money(m.serviceFees)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-info">{money(m.commissions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-primary">{money(m.platform)}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end">
                            {prevMonth ? <PctBadge current={m.platform} prev={prevMonth.platform} /> : <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </td>
                      </tr>
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
