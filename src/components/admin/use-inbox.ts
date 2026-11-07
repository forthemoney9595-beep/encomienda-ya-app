'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, limit, orderBy, query, Timestamp, where, type Query } from 'firebase/firestore';
import { Bike, Clock, Gavel, MessageSquareWarning, Scale, Siren, Store, TimerOff, Wallet } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { db, useCollection, useMemoFirebase } from '@/lib/firebase';
import { toMillis } from '@/lib/format-date';
import { money } from '@/lib/format-money';
import { reasonLabel } from '@/lib/payment-issues';
import { CLAIM_TYPES, type ClaimType, type ClaimRiskSignal } from '@/lib/claim-types';
import { ADMIN_ACTIVE_STATUSES, computeStuckOrders } from '@/lib/order-stuck';
import type { Order } from '@/lib/order-service';
import { computeStoreAlerts, STORE_ALERT_THRESHOLD, STORE_ALERT_WINDOW_MIN, FAILED_DECISIONS, type DecisionRow } from '@/lib/store-compliance';
import { isStorePaused, pausedUntilMs } from '@/lib/store-hours';
import { fmtDate } from '@/lib/format-date';
import { useConfirmTimeoutWatcher } from '@/hooks/use-confirm-timeout';
import { reasonLabelOf } from '@/lib/suspension';
import type { InboxItem, InboxSourceError } from './inbox-list';

/** Tope por fuente: si el count real supera esto, la UI avisa "Hay N más, filtrá por tipo". */
export const INBOX_SOURCE_LIMIT = 200;

export interface InboxRaw {
  claims: Record<string, unknown>[];
  mismatches: Record<string, unknown>[];
  incidents: Record<string, unknown>[];
  pendingUsers: Record<string, unknown>[];
  withdrawals: Record<string, unknown>[];
  activeOrders: Order[];
  pausedStores: Record<string, unknown>[];
  appeals: Record<string, unknown>[];
}

export interface UseInboxResult {
  items: InboxItem[];
  raw: InboxRaw;
  loading: boolean;
  errors: InboxSourceError[];
  /** Reloj que avanza cada 60 s para que el "hace Xh" no quede congelado. */
  now: number;
  stuckCount: number;
  storeAlertCount: number;
}

type Any = Record<string, unknown>;
const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Fuentes de la Bandeja: listeners sobre los sets ABIERTOS (chicos por definición, con
 * `limit(200)` defensivo) + los pedidos activos para calcular los trabados. Los contadores
 * reales (badges/chips) vienen aparte de useAdminCounts.
 *
 * Las queries `resolved == false` exigen el campo explícito: los docs nuevos nacen con
 * `resolved:false` (Fases FF/NN/T). Verificado en producción el 21/10 (script de solo
 * lectura): 0 docs sin el campo en claims/payment_mismatches/driver_incidents.
 */
export function useInboxItems(opts: { enabled?: boolean } = {}): UseInboxResult {
  const { isFullAdmin, isAdmin, user } = useAuth();
  const enabled = (opts.enabled ?? true) && isAdmin;

  // `ready ? query : null` (regla ARQ-010): nada corre hasta que el rol está confirmado.
  const claimsQ = useMemoFirebase<Query | null>(() => (enabled ? query(collection(db, 'claims'), where('resolved', '==', false), orderBy('createdAt', 'desc'), limit(INBOX_SOURCE_LIMIT)) : null), [enabled]);
  const mismatchesQ = useMemoFirebase<Query | null>(() => (enabled ? query(collection(db, 'payment_mismatches'), where('resolved', '==', false), orderBy('createdAt', 'desc'), limit(INBOX_SOURCE_LIMIT)) : null), [enabled]);
  const incidentsQ = useMemoFirebase<Query | null>(() => (enabled ? query(collection(db, 'driver_incidents'), where('resolved', '==', false), orderBy('createdAt', 'desc'), limit(INBOX_SOURCE_LIMIT)) : null), [enabled]);
  const pendingQ = useMemoFirebase<Query | null>(() => (enabled ? query(collection(db, 'users'), where('isApproved', '==', false), where('status', '==', 'Pendiente'), limit(INBOX_SOURCE_LIMIT)) : null), [enabled]);
  const withdrawalsQ = useMemoFirebase<Query | null>(() => (enabled && isFullAdmin ? query(collection(db, 'withdrawals'), where('status', '==', 'pending'), orderBy('createdAt', 'desc'), limit(INBOX_SOURCE_LIMIT)) : null), [enabled, isFullAdmin]);
  const activeQ = useMemoFirebase<Query | null>(() => (enabled ? query(collection(db, 'orders'), where('status', 'in', [...ADMIN_ACTIVE_STATUSES])) : null), [enabled]);

  // Señales antifraude (Fase YY bis): set chico de reclamos ABIERTOS con alguna señal
  // (claim_risk solo existe si hubo señal; al resolver el reclamo pasa a resolved:true).
  // Índice claim_risk (resolved, createdAt DESC).
  const riskQ = useMemoFirebase<Query | null>(() => (enabled ? query(collection(db, 'claim_risk'), where('resolved', '==', false), orderBy('createdAt', 'desc'), limit(INBOX_SOURCE_LIMIT)) : null), [enabled]);
  // Apelaciones de suspensión abiertas (Fase YY ter). Índice account_appeals (resolved, createdAt DESC).
  const appealsQ = useMemoFirebase<Query | null>(() => (enabled ? query(collection(db, 'account_appeals'), where('resolved', '==', false), orderBy('createdAt', 'desc'), limit(INBOX_SOURCE_LIMIT)) : null), [enabled]);
  const appeals = useCollection<Any>(appealsQ);
  const claims = useCollection<Any>(claimsQ);
  const claimRisk = useCollection<Any>(riskQ);
  const mismatches = useCollection<Any>(mismatchesQ);
  const incidents = useCollection<Any>(incidentsQ);
  const pending = useCollection<Any>(pendingQ);
  const withdrawals = useCollection<Any>(withdrawalsQ);
  const active = useCollection<Order>(activeQ);

  // Reloj de 60 s: el "hace Xh" y el umbral de trabado se recalculan aunque el listener no cambie.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // ── Cumplimiento del comercio (Fase YY, punto 4) ──────────────────────────────
  // Rechazos / no confirmados a tiempo de los últimos 30 min, agrupados por tienda. La
  // consulta es ACOTADA (rango sobre storeDecisionAt + limit) y su corte avanza en tramos
  // de 10 min (no se re-suscribe cada minuto); el filtro fino de la ventana es en memoria
  // con el reloj de arriba. Índice orders (storeDecision, storeDecisionAt DESC).
  const decisionsFromMs = Math.floor((now - (STORE_ALERT_WINDOW_MIN + 10) * 60_000) / 600_000) * 600_000;
  const decisionsQ = useMemoFirebase<Query | null>(() => (enabled ? query(collection(db, 'orders'), where('storeDecision', 'in', FAILED_DECISIONS), where('storeDecisionAt', '>=', Timestamp.fromMillis(decisionsFromMs)), orderBy('storeDecisionAt', 'desc'), limit(INBOX_SOURCE_LIMIT)) : null), [enabled, decisionsFromMs]);
  const decisions = useCollection<DecisionRow>(decisionsQ);
  // Tiendas pausadas (set chico): para no ofrecer "Pausar 1 h" a una que ya está pausada.
  const pausedQ = useMemoFirebase<Query | null>(() => (enabled ? query(collection(db, 'stores'), where('manuallyPaused', '==', true), limit(INBOX_SOURCE_LIMIT)) : null), [enabled]);
  const pausedStores = useCollection<Any>(pausedQ);
  const storeAlerts = useMemo(() => computeStoreAlerts(decisions.data ?? [], now), [decisions.data, now]);

  // Reloj de la cancelación automática (Fase YY): la Bandeja también dispara el
  // recordatorio/vencimiento de los pedidos que esperan confirmación de la tienda.
  useConfirmTimeoutWatcher(enabled ? active.data : null, user);

  const errors = useMemo<InboxSourceError[]>(() => {
    const out: InboxSourceError[] = [];
    if (claims.error) out.push({ source: 'Reclamos', error: claims.error });
    if (claimRisk.error) out.push({ source: 'Señales de riesgo de reclamos', error: claimRisk.error });
    if (mismatches.error) out.push({ source: 'Discrepancias de pago', error: mismatches.error });
    if (incidents.error) out.push({ source: 'Incidentes', error: incidents.error });
    if (pending.error) out.push({ source: 'Aprobaciones', error: pending.error });
    if (withdrawals.error) out.push({ source: 'Retiros', error: withdrawals.error });
    if (active.error) out.push({ source: 'Pedidos activos', error: active.error });
    if (decisions.error) out.push({ source: 'Cumplimiento de tiendas', error: decisions.error });
    if (appeals.error) out.push({ source: 'Apelaciones', error: appeals.error });
    return out;
  }, [appeals.error, claims.error, claimRisk.error, mismatches.error, incidents.error, pending.error, withdrawals.error, active.error, decisions.error]);

  const stuck = useMemo(() => computeStuckOrders(active.data ?? [], now), [active.data, now]);

  const items = useMemo<InboxItem[]>(() => {
    const out: InboxItem[] = [];

    (mismatches.data ?? []).forEach((m) => {
      const reason = str(m.reason);
      const paid = num(m.paidAmount); const total = num(m.orderTotal);
      out.push({
        id: `m-${m.id}`, kind: 'mismatch', severity: 'destructive', group: 'money', icon: Scale,
        title: `Pago · ${reasonLabel(reason)} · pedido #${str(m.orderId).slice(0, 7)}`,
        subtitle: reason === 'amount_mismatch' && paid !== null && total !== null
          ? `pagó ${money(paid)}, el pedido vale ${money(total)}`
          : str(m.orderStatus) ? `el pago llegó con el pedido en "${str(m.orderStatus)}"` : 'revisar en Conciliación MP',
        amount: paid ?? total,
        since: toMillis(m.createdAt), href: '/admin/payment-issues',
        meta: { docId: m.id, orderId: str(m.orderId) },
      });
    });

    (withdrawals.data ?? []).forEach((w) => {
      const since = toMillis(w.createdAt);
      const olderThan48h = since !== null && now - since > 48 * 3_600_000;
      out.push({
        id: `w-${w.id}`, kind: 'withdrawal', severity: olderThan48h ? 'destructive' : 'warning', group: 'money', icon: Wallet,
        title: `Retiro pendiente · ${str(w.userName, 'cuenta')}`,
        subtitle: `${str(w.userRole) === 'store' ? 'tienda' : 'repartidor'} · ${str(w.source) === 'auto' ? 'liquidación automática' : 'solicitud manual'}${str(w.cbu) ? ' · CBU cargado' : ' · sin CBU'}`,
        amount: num(w.amount), since, href: '/admin/finances/payouts',
        meta: { docId: w.id, userId: str(w.userId) },
      });
    });

    const riskById = new Map<string, ClaimRiskSignal[]>();
    (claimRisk.data ?? []).forEach((r) => { if (Array.isArray(r.signals) && r.signals.length) riskById.set(str(r.claimId) || String(r.id), r.signals as ClaimRiskSignal[]); });

    (claims.data ?? []).forEach((c) => {
      const type = str(c.type) as ClaimType;
      const label = CLAIM_TYPES[type]?.label || type || 'Reclamo';
      const prev = num(c.previousClaims) ?? 0; const prevRef = num(c.previousRefunded) ?? 0;
      // Con alguna señal antifraude el ítem sube a rojo (sin bloquear nada: decide el admin).
      const signals = riskById.get(String(c.id)) ?? [];
      out.push({
        id: `c-${c.id}`, kind: 'claim', severity: signals.length ? 'destructive' : 'warning', group: 'disputes', icon: MessageSquareWarning,
        title: `Reclamo · ${label} · pedido #${str(c.orderId).slice(0, 7)}`,
        subtitle: `${signals.length ? `⚠ ${signals.map(s => s.label).join(' · ')} · ` : ''}${str(c.userName, 'comprador')} · ${str(c.storeName, 'tienda')} · ${prev === 0 ? '1er reclamo' : `${prev + 1}º reclamo, ${prevRef} reembolsado${prevRef === 1 ? '' : 's'}`}`,
        amount: num(c.suggestedAmount), since: toMillis(c.createdAt), href: `/admin/claims`,
        meta: { docId: c.id, orderId: str(c.orderId), risk: signals.map(s => s.code) },
      });
    });

    // Apelaciones: severidad ALTA — hay una persona sin poder trabajar esperando respuesta.
    (appeals.data ?? []).forEach((a) => {
      const isStore = str(a.role) === 'store';
      out.push({
        id: `ap-${a.id}`, kind: 'appeal', severity: 'destructive', group: 'disputes', icon: Gavel,
        title: `Apelación · ${isStore ? 'tienda' : 'repartidor'} ${str(a.accountName, 'cuenta')} · ${reasonLabelOf(a.suspensionReason)}`,
        subtitle: str(a.text).slice(0, 140),
        since: toMillis(a.createdAt),
        href: isStore && str(a.storeId) ? `/admin/stores/${str(a.storeId)}` : `/admin/delivery/${str(a.uid)}`,
        meta: { docId: a.id, uid: str(a.uid), accountName: str(a.accountName), text: str(a.text) },
      });
    });

    (incidents.data ?? []).forEach((i) => {
      const problem = str(i.type) === 'problem_reported';
      out.push({
        id: `i-${i.id}`, kind: 'incident', severity: problem ? 'destructive' : 'info', group: problem ? 'disputes' : 'info', icon: Siren,
        title: `${problem ? 'Problema reportado' : 'Pedido soltado'} · ${str(i.driverName, 'repartidor')} · pedido #${str(i.orderId).slice(0, 7)}`,
        subtitle: `${str(i.storeName, '')}${str(i.storeName) && str(i.reason) ? ' · ' : ''}${str(i.reason)}`,
        since: toMillis(i.createdAt), href: `/admin/orders/${str(i.orderId)}`,
        meta: { docId: i.id, orderId: str(i.orderId), driverId: str(i.driverId) },
      });
    });

    (pending.data ?? []).forEach((u) => {
      const isStore = str(u.role) === 'store';
      if (!isStore && str(u.role) !== 'delivery') return;
      out.push({
        id: `a-${u.id}`, kind: 'approval', severity: 'warning', group: 'approvals', icon: isStore ? Store : Bike,
        title: `${isStore ? 'Tienda' : 'Repartidor'} pendiente de aprobación · ${str(u.displayName) || str(u.name) || str(u.email, 'cuenta')}`,
        subtitle: `${str(u.email)}${str(u.phoneNumber) ? ' · ' + str(u.phoneNumber) : ''}`,
        since: toMillis(u.createdAt), href: isStore ? '/admin/stores' : '/admin/delivery',
        meta: { userId: u.id, role: str(u.role), name: str(u.displayName) || str(u.name) || str(u.email) },
      });
    });

    stuck.forEach(({ order: o, elapsedMs }) => {
      const old = elapsedMs >= 24 * 3_600_000;
      out.push({
        id: `s-${o.id}`, kind: 'stuck', severity: old ? 'destructive' : 'warning', group: 'info', icon: Clock,
        title: `Trabado · ${o.status} · pedido #${o.id.slice(0, 7)}`,
        subtitle: `${o.customerName || 'cliente'} · ${o.storeName || 'tienda'}${o.status === 'Listo para recoger' ? ' · ningún repartidor lo tomó' : ''}`,
        amount: num(o.total), since: now - elapsedMs, href: `/admin/orders/${o.id}`,
        meta: { orderId: o.id, status: o.status },
      });
    });

    storeAlerts.forEach((a) => {
      const pausedDoc = (pausedStores.data ?? []).find(st => st.id === a.storeId);
      const alreadyPaused = !!pausedDoc && isStorePaused(pausedDoc as { manuallyPaused?: boolean; pausedUntil?: unknown }, now);
      const until = pausedDoc ? pausedUntilMs(pausedDoc as { pausedUntil?: unknown }) : null;
      const parts = [a.rejected ? `${a.rejected} rechazado${a.rejected === 1 ? '' : 's'}` : '', a.timeouts ? `${a.timeouts} no confirmado${a.timeouts === 1 ? '' : 's'} a tiempo` : ''].filter(Boolean);
      out.push({
        id: `t-${a.storeId}`, kind: 'store_alert', severity: 'warning', group: 'disputes', icon: TimerOff,
        title: `Tienda ${a.storeName}: ${a.total} pedidos rechazados o no confirmados en ${STORE_ALERT_WINDOW_MIN} min`,
        subtitle: `${parts.join(' y ')}${alreadyPaused ? (until ? ` · ya pausada hasta las ${fmtDate(until, 'time')}` : ' · ya pausada') : ' · ¿está atendiendo?'}`,
        since: a.lastAt, href: `/admin/stores/${a.storeId}`,
        meta: { storeId: a.storeId, storeName: a.storeName, alreadyPaused, threshold: STORE_ALERT_THRESHOLD },
      });
    });

    return out;
  }, [appeals.data, mismatches.data, withdrawals.data, claims.data, claimRisk.data, incidents.data, pending.data, stuck, now, storeAlerts, pausedStores.data]);

  const loading = appeals.isLoading || claims.isLoading || mismatches.isLoading || incidents.isLoading || pending.isLoading || active.isLoading || (isFullAdmin && withdrawals.isLoading);

  return {
    items, loading, errors, now, stuckCount: stuck.length, storeAlertCount: storeAlerts.length,
    raw: {
      claims: claims.data ?? [], mismatches: mismatches.data ?? [], incidents: incidents.data ?? [],
      pendingUsers: pending.data ?? [], withdrawals: withdrawals.data ?? [], activeOrders: active.data ?? [],
      pausedStores: pausedStores.data ?? [],
      appeals: appeals.data ?? [],
    },
  };
}
