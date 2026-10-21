'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, getCountFromServer, query, where, type Query } from 'firebase/firestore';
import * as Sentry from '@sentry/nextjs';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/auth-context';
import type { AdminCountKey } from '@/lib/admin-nav';

/**
 * useAdminCounts — los badges del menú y los chips de la Bandeja, de verdad.
 *
 * UNA instancia en el shell (contexto). Corre ≤ 7 `getCountFromServer` (1 lectura cada 1.000
 * docs que matchean) y los refresca: (a) al montar, (b) al volver el foco con debounce de
 * 30 s, (c) cada 5 min mientras la pestaña está visible, y (d) después de cualquier acción
 * admin — toda acción que resuelve algo llama `counts.refresh()` en su finally.
 *
 * Antes los dos listeners del nav bajaban docs COMPLETOS solo para contar (y crecían con los
 * retiros pendientes), y los pendientes de reclamos/incidentes/discrepancias se contaban
 * sobre la página cargada (8/25/50 docs): podían mentir.
 */
export type AdminCounts = Record<Exclude<AdminCountKey, 'inboxTotal'>, number | null>;

export interface AdminCountsValue {
  counts: AdminCounts;
  /** Suma de los abiertos de la Bandeja (sin retiros para support). null mientras carga. */
  inboxTotal: number | null;
  loading: boolean;
  errors: Partial<Record<keyof AdminCounts, unknown>>;
  refreshedAt: number | null;
  refresh: () => Promise<void>;
  /** Lee un contador por clave (incluye 'inboxTotal'). */
  get: (key: AdminCountKey) => number | null;
}

const EMPTY: AdminCounts = {
  claimsOpen: null, mismatchesOpen: null, incidentsOpen: null,
  pendingStores: null, pendingDrivers: null, withdrawalsPending: null,
};

const AdminCountsContext = createContext<AdminCountsValue | null>(null);

const FOCUS_DEBOUNCE_MS = 30_000;
const INTERVAL_MS = 5 * 60_000;

function buildQueries(isFullAdmin: boolean): Partial<Record<keyof AdminCounts, Query>> {
  const q: Partial<Record<keyof AdminCounts, Query>> = {
    claimsOpen: query(collection(db, 'claims'), where('resolved', '==', false)),
    mismatchesOpen: query(collection(db, 'payment_mismatches'), where('resolved', '==', false)),
    incidentsOpen: query(collection(db, 'driver_incidents'), where('resolved', '==', false)),
    // Igualdades múltiples: Firestore combina índices de un campo (sin índice compuesto).
    // `status == 'Pendiente'` excluye a los rechazados, que también tienen isApproved:false.
    pendingStores: query(collection(db, 'users'), where('role', '==', 'store'), where('isApproved', '==', false), where('status', '==', 'Pendiente')),
    pendingDrivers: query(collection(db, 'users'), where('role', '==', 'delivery'), where('isApproved', '==', false), where('status', '==', 'Pendiente')),
  };
  if (isFullAdmin) q.withdrawalsPending = query(collection(db, 'withdrawals'), where('status', '==', 'pending'));
  return q;
}

export function AdminCountsProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin, isFullAdmin, loading: authLoading } = useAuth();
  const [counts, setCounts] = useState<AdminCounts>(EMPTY);
  const [errors, setErrors] = useState<AdminCountsValue['errors']>({});
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const lastRunRef = useRef(0);
  const runningRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    if (runningRef.current) return runningRef.current;
    const run = (async () => {
      lastRunRef.current = Date.now();
      const queries = buildQueries(isFullAdmin);
      const keys = Object.keys(queries) as (keyof AdminCounts)[];
      const results = await Promise.allSettled(keys.map(k => getCountFromServer(queries[k]!)));
      const next: AdminCounts = { ...EMPTY };
      const errs: AdminCountsValue['errors'] = {};
      results.forEach((r, i) => {
        const k = keys[i];
        if (r.status === 'fulfilled') next[k] = r.value.data().count;
        else {
          errs[k] = r.reason;
          console.error('[useAdminCounts] falló', k, r.reason);
          try { Sentry.captureException(r.reason, { tags: { area: 'admin-counts', key: k } }); } catch { /* noop */ }
        }
      });
      if (!isFullAdmin) next.withdrawalsPending = 0;
      setCounts(next);
      setErrors(errs);
      setRefreshedAt(Date.now());
      setLoading(false);
    })();
    runningRef.current = run;
    try { await run; } finally { runningRef.current = null; }
  }, [isAdmin, isFullAdmin]);

  // (a) montar / cambio de nivel
  useEffect(() => {
    if (authLoading || !isAdmin) return;
    void refresh();
  }, [authLoading, isAdmin, refresh]);

  // (b) foco con debounce + (c) intervalo de 5 min mientras está visible
  useEffect(() => {
    if (!isAdmin || typeof window === 'undefined') return;
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRunRef.current < FOCUS_DEBOUNCE_MS) return;
      void refresh();
    };
    const tick = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const id = window.setInterval(tick, INTERVAL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.clearInterval(id);
    };
  }, [isAdmin, refresh]);

  const value = useMemo<AdminCountsValue>(() => {
    const parts = [counts.claimsOpen, counts.mismatchesOpen, counts.incidentsOpen, counts.pendingStores, counts.pendingDrivers, ...(isFullAdmin ? [counts.withdrawalsPending] : [])];
    const inboxTotal = parts.some(p => p === null) ? null : parts.reduce<number>((a, b) => a + (b ?? 0), 0);
    return {
      counts, inboxTotal, loading, errors, refreshedAt, refresh,
      get: (key) => key === 'inboxTotal' ? inboxTotal : counts[key],
    };
  }, [counts, loading, errors, refreshedAt, refresh, isFullAdmin]);

  return <AdminCountsContext.Provider value={value}>{children}</AdminCountsContext.Provider>;
}

const FALLBACK: AdminCountsValue = {
  counts: EMPTY, inboxTotal: null, loading: true, errors: {}, refreshedAt: null,
  refresh: async () => {}, get: () => null,
};

export function useAdminCounts(): AdminCountsValue {
  return useContext(AdminCountsContext) ?? FALLBACK;
}
