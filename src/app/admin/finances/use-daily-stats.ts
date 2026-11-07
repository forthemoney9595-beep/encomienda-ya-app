'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FALLBACK_COMMISSION, type MoneyOrder } from '@/lib/money';
import { toMillis } from '@/lib/format-date';
import {
  aggregateDailyOrders, sumDailyBuckets, dayIdART, dayStartART, addDaysId, listDayIds, financePeriodBounds,
  type DailyBucket, type DailyOrderInput, type FinancePeriod, type FinancePeriodBounds,
} from '@/lib/platform-daily';

export interface DailyStatsDay { id: string; bucket: DailyBucket | null; live?: boolean }

export interface DailyStatsResult {
  loading: boolean;
  error: unknown | null;
  bounds: FinancePeriodBounds | null;
  /** Período actual (cierres + HOY en vivo si corresponde). */
  current: DailyBucket | null;
  /** Período de comparación (null si el período no compara). */
  previous: DailyBucket | null;
  /** Un ítem por día del período actual, para el gráfico (bucket null = sin actividad). */
  days: DailyStatsDay[];
  /** El día en curso calculado en vivo (null si el período no lo incluye). */
  today: DailyBucket | null;
  todayId: string;
  fallbackRate: number;
  /** Lecturas de Firestore de la última carga (cierres + pedidos de hoy + config). */
  reads: number;
  refreshedAt: number | null;
  refresh: () => void;
}

/**
 * Resumen financiero (Tanda T2): lee los cierres DIARIOS (`platform_daily`, ≤ 2 × ventana
 * docs — a 30 d con comparación son ≤ 60 lecturas, y solo existen los días con actividad) y
 * suma el día EN CURSO en vivo con la MISMA función que el cron (`aggregateDailyOrders`) sobre
 * el set chico de pedidos de hoy. Antes esta pantalla bajaba ~75 días de pedidos entregados por
 * carga (1.350 · 10.125 · 50.625 lecturas según el modelo de tráfico).
 */
export function useDailyStats(period: FinancePeriod, enabled: boolean): DailyStatsResult {
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown | null>(null);
  const [data, setData] = useState<Omit<DailyStatsResult, 'loading' | 'error' | 'refresh' | 'fallbackRate' | 'todayId'> | null>(null);
  const [fallbackRate, setFallbackRate] = useState(FALLBACK_COMMISSION);
  const [tick, setTick] = useState(0);
  const rateRef = useRef<number | null>(null);
  const todayId = dayIdART(Date.now());

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let reads = 0;
        if (rateRef.current === null) {
          const cfg = await getDoc(doc(db, 'config', 'platform'));
          reads += 1;
          const v = Number(cfg.data()?.defaultCommissionRate);
          rateRef.current = Number.isFinite(v) && v > 0 ? v : FALLBACK_COMMISSION;
          if (!cancelled) setFallbackRate(rateRef.current);
        }
        const rate = rateRef.current;
        const bounds = financePeriodBounds(period, todayId);
        const yesterdayId = addDaysId(todayId, -1);

        // Cierres: un solo rango que cubre comparación + actual, hasta AYER (hoy nunca está guardado).
        const minId = bounds.prevFromId && bounds.prevFromId < bounds.fromId ? bounds.prevFromId : bounds.fromId;
        const maxId = bounds.toId < yesterdayId ? bounds.toId : yesterdayId;
        const byId = new Map<string, DailyBucket>();
        if (maxId >= minId) {
          const snap = await getDocs(query(collection(db, 'platform_daily'), where('ymd', '>=', minId), where('ymd', '<=', maxId), orderBy('ymd', 'asc')));
          reads += snap.size;
          snap.docs.forEach(d => byId.set(d.id, d.data() as DailyBucket));
        }

        // Hoy, en vivo: los pedidos creados desde las 00:00 ART (set chico), misma función que el cron.
        let today: DailyBucket | null = null;
        if (bounds.includesToday) {
          const snap = await getDocs(query(collection(db, 'orders'), where('createdAt', '>=', Timestamp.fromDate(dayStartART(todayId)))));
          reads += snap.size;
          const inputs: DailyOrderInput[] = snap.docs.map(d => {
            const o = d.data() as MoneyOrder & { status?: string; createdAt?: unknown; deliveredAt?: unknown };
            return { ...o, createdAtMs: toMillis(o.createdAt), deliveredAtMs: toMillis(o.deliveredAt) };
          });
          today = aggregateDailyOrders(inputs, rate);
        }

        const pick = (id: string): DailyBucket | null => (id === todayId ? today : byId.get(id) ?? null);
        const curIds = listDayIds(bounds.fromId, bounds.toId);
        const current = sumDailyBuckets(curIds.map(pick));
        const previous = bounds.prevFromId && bounds.prevToId ? sumDailyBuckets(listDayIds(bounds.prevFromId, bounds.prevToId).map(pick)) : null;
        const days: DailyStatsDay[] = curIds.map(id => ({ id, bucket: pick(id), live: id === todayId }));

        if (!cancelled) setData({ bounds, current, previous, days, today, reads, refreshedAt: Date.now() });
      } catch (e) {
        if (!cancelled) { console.error('[useDailyStats]', e); setError(e); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, period, todayId, tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  return useMemo<DailyStatsResult>(() => ({
    loading, error, refresh, fallbackRate, todayId,
    bounds: data?.bounds ?? null, current: data?.current ?? null, previous: data?.previous ?? null,
    days: data?.days ?? [], today: data?.today ?? null, reads: data?.reads ?? 0, refreshedAt: data?.refreshedAt ?? null,
  }), [loading, error, refresh, fallbackRate, todayId, data]);
}
