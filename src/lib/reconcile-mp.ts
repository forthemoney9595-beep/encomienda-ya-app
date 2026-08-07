import MercadoPagoConfig, { Payment } from "mercadopago";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { notifyUser } from "@/lib/notify-server";
import { logAdminActionServer } from "@/lib/admin-audit-server";
import * as Sentry from "@sentry/nextjs";

// Conciliación con MercadoPago (Fase NN bis). El webhook es el camino rápido para
// enterarse de un pago; esto es la red de seguridad que corre aparte y compara los dos
// registros en las DOS direcciones:
//
//   A) sistema → MP: cada orden marcada pagada se re-consulta en MP. Si MP dice que esa
//      plata ya no está (refunded/charged_back/cancelled), la orden queda marcada y la
//      discrepancia va a payment_mismatches — sin esto, se seguía liquidando a la tienda
//      plata que MP ya devolvió.
//   B) MP → sistema: se listan los pagos aprobados recientes en MP y se verifica que cada
//      uno tenga su orden marcada pagada. Un webhook perdido deja al cliente con la plata
//      pagada y el pedido muerto en "Pendiente de Pago" — ese caso (y SOLO ese, con la
//      misma validación de monto/estado del webhook) se repara solo. Todo lo demás se
//      marca para revisión manual: la conciliación nunca mueve plata por su cuenta.
//
// Cada corrida queda registrada en la colección `reconciliations` (cuándo, cuántos
// pagos revisó, qué reparó, qué marcó) — una conciliación sin historial no permite saber
// si viene corriendo o desde cuándo está rota.

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });

// Ventanas de revisión. A escala Tinogasta esto cubre de sobra; si algún día el volumen
// crece, achicar la ventana A (los pagos viejos ya conciliados no cambian solos).
const ORDERS_LOOKBACK_DAYS = 30;
const ORDERS_CAP = 300;
const MP_SEARCH_PAGES = 4; // 4 × 50 = hasta 200 pagos recientes de MP

const REVERSED_STATUSES = ["refunded", "charged_back", "cancelled"];

export interface ReconcileSummary {
  checkedOrders: number;      // dirección A: órdenes pagadas re-consultadas en MP
  checkedPayments: number;    // dirección B: pagos aprobados de MP revisados
  ok: number;
  repaired: number;           // webhooks perdidos reparados (marcados pagados)
  flagged: number;            // discrepancias nuevas en payment_mismatches
  unverifiable: number;       // órdenes pagadas sin mpPaymentId (no hay qué consultar)
  errors: number;
  notes: string[];            // detalle corto de cada reparación/marca
}

// Evita duplicar una discrepancia ya abierta para el mismo pedido y motivo: la
// conciliación corre todos los días y un problema sin resolver no debe multiplicarse.
async function hasOpenMismatch(orderId: string, reason: string): Promise<boolean> {
  const snap = await adminDb.collection("payment_mismatches")
    .where("orderId", "==", orderId)
    .where("reason", "==", reason)
    .limit(10)
    .get();
  return snap.docs.some(d => d.data().resolved !== true);
}

async function flagMismatch(opts: {
  orderId: string; paymentId: string | number | null; reason: string;
  paidAmount: number; orderTotal: number; mpStatus: string; extra?: Record<string, any>;
}): Promise<boolean> {
  if (await hasOpenMismatch(opts.orderId, opts.reason)) return false;
  await adminDb.collection("payment_mismatches").add({
    orderId: opts.orderId,
    paymentId: opts.paymentId ?? null,
    reason: opts.reason,
    paidAmount: opts.paidAmount,
    orderTotal: opts.orderTotal,
    mpStatus: opts.mpStatus,
    source: "reconcile",
    createdAt: new Date(),
    resolved: false,
    ...(opts.extra || {}),
  });
  await adminDb.collection("orders").doc(opts.orderId).set(
    { hasPaymentIssue: true, paymentIssueReason: opts.reason, updatedAt: new Date() },
    { merge: true },
  ).catch(() => { /* la orden puede no existir (orphan_payment) */ });
  return true;
}

export async function runReconciliation(source: "cron" | "manual", byUid?: string): Promise<ReconcileSummary> {
  const startedAt = new Date();
  const summary: ReconcileSummary = {
    checkedOrders: 0, checkedPayments: 0, ok: 0, repaired: 0,
    flagged: 0, unverifiable: 0, errors: 0, notes: [],
  };
  const payment = new Payment(client);
  const note = (s: string) => { if (summary.notes.length < 40) summary.notes.push(s); };

  // ── Dirección A: órdenes pagadas → ¿MP sigue diciendo lo mismo? ──
  try {
    const cutoff = Timestamp.fromMillis(Date.now() - ORDERS_LOOKBACK_DAYS * 86_400_000);
    const paidSnap = await adminDb.collection("orders")
      .where("paymentStatus", "==", "paid")
      .where("createdAt", ">=", cutoff)
      .orderBy("createdAt", "desc")
      .limit(ORDERS_CAP)
      .get();

    for (const orderDoc of paidSnap.docs) {
      const order = orderDoc.data();
      if (!order.mpPaymentId) { summary.unverifiable++; continue; }
      summary.checkedOrders++;

      try {
        const p = await payment.get({ id: order.mpPaymentId });
        const mpStatus = String(p.status);
        const mpAmount = Number(p.transaction_amount) || 0;

        if (REVERSED_STATUSES.includes(mpStatus)) {
          // La plata ya no está pero la orden sigue contando como cobrada. Igual que la
          // rama payment_reversed del webhook, para cuando el webhook de reversa no llegó.
          if (!order.refunded) {
            const created = await flagMismatch({
              orderId: orderDoc.id, paymentId: order.mpPaymentId, reason: "payment_reversed",
              paidAmount: mpAmount, orderTotal: Number(order.total) || 0, mpStatus,
            });
            if (created) {
              await orderDoc.ref.set({ paymentStatus: "reversed" }, { merge: true });
              summary.flagged++;
              note(`⚠ ${orderDoc.id}: pago revertido en MP (${mpStatus}), detectado por conciliación`);
            } else summary.ok++;
          } else summary.ok++;
        } else if (mpStatus !== "approved") {
          // Pagada acá pero MP nunca la aprobó (rejected/pending/in_process): no debería
          // poder pasar por el webhook — si aparece, alguien marcó pagado a mano o hay
          // un bug. Nunca se "des-marca" solo: revisión manual.
          const created = await flagMismatch({
            orderId: orderDoc.id, paymentId: order.mpPaymentId, reason: "reconcile_mismatch",
            paidAmount: mpAmount, orderTotal: Number(order.total) || 0, mpStatus,
          });
          if (created) { summary.flagged++; note(`⚠ ${orderDoc.id}: pagada acá pero MP dice "${mpStatus}"`); }
          else summary.ok++;
        } else {
          summary.ok++;
        }
      } catch (e: any) {
        // Pago no encontrado en MP con la orden pagada = también sospechoso.
        if (e?.status === 404) {
          const created = await flagMismatch({
            orderId: orderDoc.id, paymentId: order.mpPaymentId, reason: "reconcile_mismatch",
            paidAmount: 0, orderTotal: Number(order.total) || 0, mpStatus: "not_found",
          });
          if (created) { summary.flagged++; note(`⚠ ${orderDoc.id}: el pago ${order.mpPaymentId} no existe en MP`); }
        } else {
          summary.errors++;
          Sentry.captureException(e, { tags: { area: "reconcile-mp", direction: "A" }, extra: { orderId: orderDoc.id } });
        }
      }
    }
  } catch (e) {
    summary.errors++;
    Sentry.captureException(e, { tags: { area: "reconcile-mp", direction: "A" } });
  }

  // ── Dirección B: pagos aprobados en MP → ¿cada uno tiene su orden pagada? ──
  try {
    for (let page = 0; page < MP_SEARCH_PAGES; page++) {
      const res: any = await payment.search({
        options: {
          status: "approved",
          range: "date_created",
          begin_date: "NOW-7DAYS",
          end_date: "NOW",
          sort: "date_created",
          criteria: "desc",
          limit: 50,
          offset: page * 50,
        },
      });
      const results: any[] = res?.results || [];

      for (const p of results) {
        const orderId = p.external_reference || p.metadata?.order_id;
        if (!orderId) continue; // pago que no vino de la app (sin referencia nuestra)
        summary.checkedPayments++;

        const orderRef = adminDb.collection("orders").doc(String(orderId));
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
          const created = await flagMismatch({
            orderId: String(orderId), paymentId: p.id, reason: "orphan_payment",
            paidAmount: Number(p.transaction_amount) || 0, orderTotal: 0, mpStatus: String(p.status),
          });
          if (created) { summary.flagged++; note(`⚠ pago ${p.id}: cobrado en MP pero el pedido ${orderId} no existe`); }
          else summary.ok++;
          continue;
        }

        const order = orderSnap.data()!;
        const paidAmount = Number(p.transaction_amount) || 0;
        const orderTotal = Number(order.total) || 0;

        if (order.paymentStatus === "paid") {
          if (order.mpPaymentId && String(order.mpPaymentId) !== String(p.id)) {
            const created = await flagMismatch({
              orderId: String(orderId), paymentId: p.id, reason: "duplicate_payment",
              paidAmount, orderTotal, mpStatus: String(p.status),
              extra: { previousPaymentId: order.mpPaymentId },
            });
            if (created) { summary.flagged++; note(`⚠ ${orderId}: doble pago detectado (${p.id})`); }
            else summary.ok++;
          } else summary.ok++;
          continue;
        }

        // 🔧 EL caso que la conciliación repara sola: pago aprobado en MP cuya orden nunca
        // se marcó pagada (webhook perdido). MISMA validación que el webhook — monto ±$1 y
        // orden todavía esperando el pago; cualquier otra combinación va a revisión manual.
        if (Math.abs(paidAmount - orderTotal) > 1) {
          const created = await flagMismatch({
            orderId: String(orderId), paymentId: p.id, reason: "amount_mismatch",
            paidAmount, orderTotal, mpStatus: String(p.status),
          });
          if (created) { summary.flagged++; note(`⚠ ${orderId}: pagó $${paidAmount} pero el pedido vale $${orderTotal}`); }
          continue;
        }
        if (order.status !== "Pendiente de Pago") {
          const created = await flagMismatch({
            orderId: String(orderId), paymentId: p.id, reason: "unexpected_order_status",
            paidAmount, orderTotal, mpStatus: String(p.status), extra: { orderStatus: order.status },
          });
          if (created) { summary.flagged++; note(`⚠ ${orderId}: pago aprobado con el pedido en "${order.status}"`); }
          continue;
        }

        await orderRef.set({
          paymentStatus: "paid",
          status: "En preparación",
          mpPaymentId: p.id,
          paidAmount,
          paidAt: new Date(),
          updatedAt: new Date(),
          readyForPickup: false,
          recoveredByReconcile: true, // rastro de que lo levantó la conciliación, no el webhook
        }, { merge: true });

        summary.repaired++;
        note(`🔧 ${orderId}: pago aprobado sin webhook — orden marcada pagada`);

        // Mismos avisos que hubiera mandado el webhook.
        if (order.userId) {
          await notifyUser({
            userId: order.userId, type: "payment_success", orderId: String(orderId),
            title: "Pago Recibido ✅",
            body: "Tu pago se acreditó y la tienda ya está preparando tu pedido.",
          });
        }
        const targetStoreUser = order.storeOwnerId || order.storeId;
        if (targetStoreUser) {
          await notifyUser({
            userId: targetStoreUser, type: "order_paid", orderId: String(orderId),
            title: "¡Pago Confirmado! 💰",
            body: `Orden #${String(orderId).substring(0, 6)} pagada por $${paidAmount.toLocaleString("es-AR")}. A cocinar.`,
          });
        }
        // Marcar una orden como pagada es un cambio de estado de plata: queda en el log
        // con el autor real (el admin que apretó "Conciliar ahora", o el cron).
        await logAdminActionServer(
          byUid || "cron", "reconcile_repair", String(orderId),
          `pago ${p.id} aprobado en MP sin webhook — orden marcada pagada ($${paidAmount.toLocaleString("es-AR")})`,
        );
      }

      if (results.length < 50) break;
    }
  } catch (e) {
    summary.errors++;
    Sentry.captureException(e, { tags: { area: "reconcile-mp", direction: "B" } });
  }

  await adminDb.collection("reconciliations").add({
    startedAt: Timestamp.fromDate(startedAt),
    finishedAt: Timestamp.now(),
    source,
    ...(byUid ? { byUid } : {}),
    checkedOrders: summary.checkedOrders,
    checkedPayments: summary.checkedPayments,
    ok: summary.ok,
    repaired: summary.repaired,
    flagged: summary.flagged,
    unverifiable: summary.unverifiable,
    errors: summary.errors,
    notes: summary.notes,
  });

  return summary;
}
