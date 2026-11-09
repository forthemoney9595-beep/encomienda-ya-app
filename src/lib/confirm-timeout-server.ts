import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import * as Sentry from '@sentry/nextjs';
import { notifyUser } from '@/lib/notify-server';
import { returnStockForOrder } from '@/lib/stock-service';
import { fmtDate } from '@/lib/format-date';
import {
  AUTO_UNCONFIRMED, PENDING_CONFIRMATION, decideConfirmTimeout, resolveConfirmConfig, type ConfirmConfig,
} from '@/lib/confirm-timeout';

// Aplicación con Admin SDK del recordatorio / cancelación automática (Fase YY). La decisión
// es la función pura de `confirm-timeout.ts`; acá va la transacción, el stock y los avisos.
// La usan `/api/orders/confirm-timeout` (disparada por los clientes que miran el pedido) y el
// barrido del cron diario de conciliación (red de seguridad).

export type ConfirmTimeoutResult = {
  action: 'none' | 'reminded' | 'cancelled';
  reminderAt: number | null;
  timeoutAt: number | null;
  status: string | null;
};

const toMs = (v: unknown): number | null => {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toMillis();
  const anyV = v as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof anyV.toMillis === 'function') return anyV.toMillis();
  const s = anyV.seconds ?? anyV._seconds;
  return typeof s === 'number' ? s * 1000 : null;
};

export async function loadConfirmConfig(): Promise<ConfirmConfig> {
  const snap = await adminDb.collection('config').doc('platform').get();
  return resolveConfirmConfig(snap.data() || {});
}

async function storeOwnerOf(order: Record<string, any>): Promise<string | null> {
  if (order.storeOwnerId) return String(order.storeOwnerId);
  if (!order.storeId) return null;
  const s = await adminDb.collection('stores').doc(String(order.storeId)).get();
  return (s.data()?.ownerId as string) || null;
}

/**
 * Evalúa UN pedido y, si corresponde, manda el recordatorio o lo cancela. Idempotente:
 * - el recordatorio se marca (`confirmReminderSentAt`) en la MISMA transacción que decide,
 *   así dos llamadas simultáneas no avisan dos veces;
 * - la cancelación RE-EXIGE 'Pendiente de Confirmación' dentro de la transacción (misma
 *   disciplina que confirm-stock, ARQ-006): si la tienda confirma en el mismo instante,
 *   exactamente una de las dos escrituras gana y la otra ve el estado nuevo y no hace nada.
 * Antes del pago no hay plata en juego: no se crea ningún `payment_mismatches`.
 */
export async function applyConfirmTimeout(orderId: string, opts: { config?: ConfirmConfig; source?: 'api' | 'cron' } = {}): Promise<ConfirmTimeoutResult> {
  const config = opts.config ?? (await loadConfirmConfig());
  const orderRef = adminDb.collection('orders').doc(orderId);

  let order: Record<string, any> | null = null;
  const outcome = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return { action: 'none' as const, reminderAt: null, timeoutAt: null, status: null };
    order = snap.data()!;
    // El reloj es el del SERVIDOR, leído en cada reintento de la transacción.
    const nowMs = Date.now();
    const d = decideConfirmTimeout({
      status: order.status,
      createdAtMs: toMs(order.createdAt),
      reminderSentAtMs: toMs(order.confirmReminderSentAt),
      nowMs,
      config,
    });
    if (d.action === 'remind') {
      tx.update(orderRef, { confirmReminderSentAt: Timestamp.fromMillis(nowMs) });
      return { action: 'reminded' as const, reminderAt: d.reminderAt, timeoutAt: d.timeoutAt, status: order.status as string };
    }
    if (d.action === 'cancel') {
      const now = Timestamp.fromMillis(nowMs);
      tx.update(orderRef, {
        status: 'Cancelado',
        cancelReason: AUTO_UNCONFIRMED,
        cancelledBy: 'system',
        cancelledAt: now,
        updatedAt: now,
        // Métrica de cumplimiento (punto 4): la decisión de la tienda fue "no contestó".
        storeDecision: 'timeout',
        storeDecisionAt: now,
      });
      return { action: 'cancelled' as const, reminderAt: d.reminderAt, timeoutAt: d.timeoutAt, status: 'Cancelado' };
    }
    return { action: 'none' as const, reminderAt: d.reminderAt, timeoutAt: d.timeoutAt, status: order.status as string };
  });

  const o = order as Record<string, any> | null;
  if (!o || outcome.action === 'none') return outcome;
  const shortId = orderId.substring(0, 6);

  if (outcome.action === 'reminded') {
    const ownerId = await storeOwnerOf(o);
    if (ownerId) {
      await notifyUser({
        userId: ownerId,
        title: 'Pedido esperando confirmación',
        body: `El pedido #${shortId} de ${o.customerName || 'un cliente'} espera que lo confirmes. Si no lo confirmás antes de las ${fmtDate(outcome.timeoutAt, 'time')}, se cancela solo.`,
        type: 'order_request',
        orderId,
      });
    }
    return outcome;
  }

  // Cancelado: devolver el stock reservado (idempotente por `stockReturnedAt`) y avisar.
  try {
    await returnStockForOrder(orderId, { reason: AUTO_UNCONFIRMED });
  } catch (e) {
    // returnStockForOrder ya reporta y no relanza; esto es solo por si cambia.
    Sentry.captureException(e, { tags: { area: 'confirm-timeout', step: 'stock' }, extra: { orderId } });
  }

  await notifyUser({
    userId: o.userId,
    title: 'Pedido cancelado',
    body: `${o.storeName || 'La tienda'} no confirmó tu pedido a tiempo, así que lo cancelamos. No se te cobró nada.`,
    type: 'order_cancelled',
    orderId,
  });
  const ownerId = await storeOwnerOf(o);
  if (ownerId) {
    await notifyUser({
      userId: ownerId,
      title: 'Pedido cancelado: no se confirmó a tiempo',
      body: `El pedido #${shortId} de ${o.customerName || 'un cliente'} se canceló porque no lo confirmaste en ${config.timeoutMinutes} minutos. Si no podés atender, pausá la tienda desde tu panel.`,
      type: 'order_cancelled',
      orderId,
    });
  }
  console.log(`Pedido ${orderId} cancelado por falta de confirmación (${opts.source || 'api'}).`);
  return outcome;
}

/**
 * Red de seguridad del cron diario: cancela los 'Pendiente de Confirmación' vencidos que
 * nadie estaba mirando. Consulta ACOTADA (`status ==` + `createdAt <=` corte + `limit`)
 * sobre el índice `orders (status, createdAt ASC)` que ya existía.
 */
export async function sweepUnconfirmedOrders(opts: { limit?: number } = {}): Promise<{ checked: number; cancelled: number; errors: number }> {
  const config = await loadConfirmConfig();
  const cutoff = Timestamp.fromMillis(Date.now() - config.timeoutMinutes * 60_000);
  const snap = await adminDb.collection('orders')
    .where('status', '==', PENDING_CONFIRMATION)
    .where('createdAt', '<=', cutoff)
    .limit(opts.limit ?? 100)
    .get();
  let cancelled = 0;
  let errors = 0;
  for (const d of snap.docs) {
    try {
      const r = await applyConfirmTimeout(d.id, { config, source: 'cron' });
      if (r.action === 'cancelled') cancelled++;
    } catch (e) {
      errors++;
      Sentry.captureException(e, { tags: { area: 'confirm-timeout', step: 'sweep' }, extra: { orderId: d.id } });
    }
  }
  return { checked: snap.size, cancelled, errors };
}
