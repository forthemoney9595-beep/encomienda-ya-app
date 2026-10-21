'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCountFromServer, getDocs, type Query, type QueryDocumentSnapshot } from 'firebase/firestore';

/**
 * usePagedQuery — paginación con cursor server-side (Anterior/Siguiente) + total por
 * `getCountFromServer` del MISMO filtro. Reemplaza la lógica de cursor copiada 7 veces en el
 * panel (orders, users, reviews, finance-view, claims, incidents, audit-log).
 *
 *   const paged = usePagedQuery<Order>({
 *     build: useCallback((cursor, size) => query(colRef, ...filtros, orderBy(...), ...(cursor ? [startAfter(cursor)] : []), limit(size)), [deps]),
 *     countQuery: useMemo(() => query(colRef, ...filtros), [deps]),
 *     pageSize: 50,
 *   });
 *
 * `build` y `countQuery` deben venir memoizados: cambiar su identidad = volver a la página 1.
 * `exportAll(max)` recorre TODO lo filtrado por cursor (tope `max`, default 5.000) para el CSV.
 */
export interface UsePagedQueryOptions {
  build: (cursor: QueryDocumentSnapshot | null, size: number) => Query | null;
  countQuery?: Query | null;
  pageSize?: number;
  /** false = no consulta nada (ej. hasta que el guard de rol esté listo). */
  enabled?: boolean;
}

export interface PagedQueryResult<T> {
  rows: T[];
  page: number;          // 0-based
  pageSize: number;
  total: number | null;  // null mientras carga o si el count falló
  totalPages: number;
  hasMore: boolean;
  hasPrev: boolean;
  rangeFrom: number;
  rangeTo: number;
  loading: boolean;
  error: unknown | null;
  countError: unknown | null;
  next: () => void;
  prev: () => void;
  reload: () => void;
  refreshedAt: number | null;
  exportAll: (max?: number) => Promise<{ rows: T[]; capped: boolean }>;
}

const EXPORT_CHUNK = 500;

export function usePagedQuery<T extends { id: string }>(opts: UsePagedQueryOptions): PagedQueryResult<T> {
  const { build, countQuery = null, pageSize = 25, enabled = true } = opts;
  const [rows, setRows] = useState<T[]>([]);
  const [pageStack, setPageStack] = useState<QueryDocumentSnapshot[]>([]);
  const [lastSnap, setLastSnap] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [countError, setCountError] = useState<unknown | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const seq = useRef(0);

  const loadPage = useCallback(async (cursor: QueryDocumentSnapshot | null) => {
    if (!enabled) { setRows([]); setLoading(false); return; }
    const q = build(cursor, pageSize);
    if (!q) { setRows([]); setLoading(false); return; }
    const mySeq = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(q);
      if (mySeq !== seq.current) return; // llegó una respuesta vieja
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() }) as T));
      setLastSnap(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === pageSize);
      setRefreshedAt(Date.now());
    } catch (e) {
      if (mySeq !== seq.current) return;
      console.error('[usePagedQuery] falló la consulta:', e);
      setRows([]);
      setHasMore(false);
      setError(e);
    } finally {
      if (mySeq === seq.current) setLoading(false);
    }
  }, [build, pageSize, enabled]);

  // Cambió el filtro (identidad de build) o se pidió reload → página 1.
  useEffect(() => {
    setPageStack([]);
    void loadPage(null);
  }, [loadPage, reloadTick]);

  // Total del mismo filtro (sin limit ni cursor).
  useEffect(() => {
    if (!enabled || !countQuery) { setTotal(null); return; }
    let cancelled = false;
    setTotal(null);
    setCountError(null);
    getCountFromServer(countQuery)
      .then(s => { if (!cancelled) setTotal(s.data().count); })
      .catch(e => { if (!cancelled) { setTotal(null); setCountError(e); console.error('[usePagedQuery] falló el count:', e); } });
    return () => { cancelled = true; };
  }, [countQuery, enabled, reloadTick]);

  const next = useCallback(() => {
    if (!hasMore || !lastSnap) return;
    setPageStack(prev => [...prev, lastSnap]);
    void loadPage(lastSnap);
  }, [hasMore, lastSnap, loadPage]);

  const prev = useCallback(() => {
    if (pageStack.length === 0) return;
    const nextStack = pageStack.slice(0, -1);
    setPageStack(nextStack);
    void loadPage(nextStack.length > 0 ? nextStack[nextStack.length - 1] : null);
  }, [pageStack, loadPage]);

  const reload = useCallback(() => setReloadTick(t => t + 1), []);

  const exportAll = useCallback(async (max = 5000) => {
    const out: T[] = [];
    let cursor: QueryDocumentSnapshot | null = null;
    let capped = false;
    // Recorre por cursor en tandas grandes hasta agotar o tocar el tope.
    for (;;) {
      const q = build(cursor, EXPORT_CHUNK);
      if (!q) break;
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        if (out.length >= max) { capped = true; break; }
        out.push({ id: d.id, ...d.data() } as T);
      }
      if (capped || snap.docs.length < EXPORT_CHUNK) break;
      cursor = snap.docs[snap.docs.length - 1] ?? null;
      if (!cursor) break;
    }
    return { rows: out, capped };
  }, [build]);

  const page = pageStack.length;
  const totalPages = typeof total === 'number' ? Math.max(1, Math.ceil(total / pageSize)) : Math.max(1, page + 1 + (hasMore ? 1 : 0));

  return useMemo(() => ({
    rows, page, pageSize, total, totalPages, hasMore, hasPrev: page > 0,
    rangeFrom: rows.length ? page * pageSize + 1 : 0,
    rangeTo: page * pageSize + rows.length,
    loading, error, countError, next, prev, reload, refreshedAt, exportAll,
  }), [rows, page, pageSize, total, totalPages, hasMore, loading, error, countError, next, prev, reload, refreshedAt, exportAll]);
}
