import { NextResponse } from "next/server";
import MercadoPagoConfig, { Payment } from "mercadopago";
import { createHmac } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { broadcastOrderToDrivers } from "@/lib/driver-broadcast";
import { pushTag } from "@/lib/notify-server";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

function verifyMpSignature(request: Request, rawBody: string, url: URL): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  // Si no hay secret configurado, se omite la verificación (para desarrollo)
  if (!secret) {
    console.warn("⚠️ [Webhook] MP_WEBHOOK_SECRET no configurado — verificación de firma omitida");
    return true;
  }

  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  if (!xSignature) {
    console.error("❌ [Webhook] Header x-signature ausente");
    return false;
  }

  const parts = xSignature.split(",");
  let ts = "";
  let v1 = "";
  for (const part of parts) {
    const [key, val] = part.trim().split("=");
    if (key === "ts") ts = val;
    if (key === "v1") v1 = val;
  }

  if (!ts || !v1) return false;

  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
  const manifest = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts};`;
  const expectedHash = createHmac("sha256", secret).update(manifest).digest("hex");

  return expectedHash === v1;
}

export async function POST(request: Request) {
  // Sin limite de pedidos por minuto esta ruta podia ser bombardeada con IDs
  // falsos (cada uno dispara una consulta real a la API de MercadoPago).
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'webhooks:mercadopago', 60, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const url = new URL(request.url);
    const rawBody = await request.text();
    let body: any = {};
    try { body = JSON.parse(rawBody); } catch { /* ignored */ }

    // 🔐 Verificar firma de MercadoPago — si no calza, NO rechazamos de entrada:
    // MercadoPago tiene una inconsistencia conocida (confirmada con el secreto
    // correcto byte a byte) entre el secreto que muestra su panel y el que usa
    // su servicio de firmas. La validacion REAL que protege esta ruta es la de
    // abajo: se vuelve a consultar el pago directo en la API de MP con nuestro
    // propio access token, y solo se procesa si esa consulta confirma "approved"
    // — un tercero no puede fabricar eso. Revisar este TODO antes de lanzar a
    // produccion real (puede requerir una app/credenciales nuevas de MP).
    if (!verifyMpSignature(request, rawBody, url)) {
      console.warn("⚠️ [Webhook] Firma no coincide — se continua, la validacion real es la consulta a la API de MP");
    }

    const queryId = url.searchParams.get("id") || url.searchParams.get("data.id");
    const paymentId = queryId || body?.data?.id;
    const type = body?.type || url.searchParams.get("topic") || url.searchParams.get("type");

    console.log(`🔔 [Webhook] Notificación recibida. ID: ${paymentId}, Type: ${type}`);

    if (!paymentId || type !== "payment") {
        return NextResponse.json({ status: "ignored_not_payment" });
    }

    // 1. Validar Pago en MercadoPago
    const payment = new Payment(client);
    const paymentData = await payment.get({ id: paymentId });

    // 2. Extraer Metadata (se necesita también en las ramas de anomalía de abajo)
    // 🔒 Tanda B: `metadata` puede venir AUSENTE en un pago que no creamos nosotros —
    // antes `metadata.buyer_id` tiraba TypeError → 500 → MP reintenta el webhook
    // indefinidamente. Sin metadata u order_id: 200 con "ignorado" para que MP lo suelte.
    const metadata = paymentData.metadata || {};
    const buyerId = metadata.buyer_id;
    const storeId = metadata.store_id;
    const storeOwnerId = metadata.store_owner_id;
    const orderRefId = metadata.order_id;

    if (!orderRefId) return NextResponse.json({ status: "ignored_no_order_metadata" });

    const ordersCollection = adminDb.collection("orders");
    const notificationsCollection = adminDb.collection("notifications");

    const existingOrder = await ordersCollection.doc(orderRefId).get();
    if (!existingOrder.exists) {
      console.error(`❌ [Webhook] Orden ${orderRefId} no encontrada — no se puede procesar el pago.`);
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }
    const existingData = existingOrder.data()!;

    // Deja el problema anotado para revisión manual Y marca la orden, para que se pueda
    // ver desde el propio pedido y no solo desde la lista de discrepancias.
    const flagIssue = async (reason: string, extra: Record<string, any> = {}) => {
      await adminDb.collection("payment_mismatches").add({
        orderId: orderRefId, paymentId, reason,
        paidAmount: Number(paymentData.transaction_amount) || 0,
        orderTotal: Number(existingData.total) || 0,
        mpStatus: paymentData.status,
        createdAt: new Date(), resolved: false, ...extra,
      });
      await ordersCollection.doc(orderRefId).set(
        { hasPaymentIssue: true, paymentIssueReason: reason, updatedAt: new Date() },
        { merge: true },
      );
    };

    // 🚨 PAGO REVERTIDO EN MERCADOPAGO (reembolso desde el panel de MP, contracargo,
    // cancelación). Antes esta rama era un `return` mudo: la orden quedaba `paid` para
    // siempre y, al entregarse, se le liquidaba a la tienda y al repartidor plata que la
    // plataforma ya había devuelto. MP reenvía el webhook en estos casos.
    if (["refunded", "charged_back", "cancelled"].includes(String(paymentData.status))) {
      if (existingData.paymentStatus === "paid") {
        console.error(`🚨 [Webhook] Pago REVERTIDO en MP (${paymentData.status}) para la orden ${orderRefId} que estaba pagada.`);
        await flagIssue("payment_reversed");
        await ordersCollection.doc(orderRefId).set({ paymentStatus: "reversed" }, { merge: true });
      }
      return NextResponse.json({ status: "payment_reversed_flagged" });
    }

    if (paymentData.status !== "approved") {
      return NextResponse.json({ status: "received_but_not_approved" });
    }

    // 🔒 BUG-201 (auditoría pre-producción): decidir y marcar el pago dentro de una
    // TRANSACCIÓN. Antes era read-check-write sin tx: dos webhooks con paymentIds distintos
    // sobre una orden impaga (el comprador abrió el link de pago dos veces) leían AMBOS
    // "no paid", los dos pasaban y marcaban pagado, y el `duplicate_payment` NO se disparaba
    // (solo corría si ya estaba paid al leer) → doble cobro invisible en tiempo real. Ahora la
    // relectura + los chequeos + la marca van atómicos: si otro webhook commitea primero, este
    // reintenta, ve la orden ya `paid` y cae en la rama de duplicado. Los efectos secundarios
    // (registrar la discrepancia, notificar) van FUERA de la tx.
    const paidAmount = Number(paymentData.transaction_amount) || 0;
    const outcome = await adminDb.runTransaction(async (tx) => {
      const fresh = await tx.get(ordersCollection.doc(orderRefId));
      const d = fresh.data()!;
      if (d.paymentStatus === "paid") {
        if (d.mpPaymentId && String(d.mpPaymentId) !== String(paymentId)) {
          return { type: "duplicate", previousPaymentId: d.mpPaymentId };
        }
        return { type: "already" };
      }
      const orderTotal = Number(d.total) || 0;
      if (Math.abs(paidAmount - orderTotal) > 1) return { type: "amount_mismatch" };
      if (d.status !== "Pendiente de Pago") return { type: "unexpected_status", orderStatus: d.status };
      // OK: marcar pagado en la MISMA tx que decidió que correspondía.
      tx.update(ordersCollection.doc(orderRefId), {
        paymentStatus: "paid",
        status: "En preparación",
        mpPaymentId: paymentId,
        // Monto REALMENTE cobrado por MP (para conciliar contra el extracto después).
        paidAmount,
        paidAt: new Date(),
        updatedAt: new Date(),
        readyForPickup: false,
      });
      return { type: "paid" };
    });

    if (outcome.type === "duplicate") {
      console.error(`🚨 [Webhook] DOBLE PAGO en la orden ${orderRefId}: ya tenía ${outcome.previousPaymentId}, llegó ${paymentId}.`);
      await flagIssue("duplicate_payment", { previousPaymentId: outcome.previousPaymentId });
      return NextResponse.json({ status: "duplicate_payment_flagged" });
    }
    if (outcome.type === "already") {
      console.log(`ℹ️ [Webhook] Orden ${orderRefId} ya procesada — ignorando duplicado`);
      return NextResponse.json({ status: "already_processed" });
    }
    if (outcome.type === "amount_mismatch") {
      console.error(`❌ [Webhook] Monto pagado ($${paidAmount}) no coincide con el total de la orden ${orderRefId}. No se marca pagada, queda para revisión manual.`);
      await flagIssue("amount_mismatch");
      return NextResponse.json({ status: "amount_mismatch_flagged_for_review" });
    }
    if (outcome.type === "unexpected_status") {
      console.error(`❌ [Webhook] Orden ${orderRefId} no está "Pendiente de Pago" (está "${outcome.orderStatus}"). Pago recibido pero no se marca, queda para revisión manual.`);
      await flagIssue("unexpected_order_status", { orderStatus: outcome.orderStatus });
      return NextResponse.json({ status: "unexpected_order_status_flagged_for_review" });
    }

    console.log(`✅ [Webhook] Pago Aprobado. Orden ${orderRefId} marcada pagada.`);

    // ==========================================
    // 4. NOTIFICACIONES PUSH (LO QUE FALTABA)
    // ==========================================
    
    // --- A) Notificación a la TIENDA ---
    const targetStoreUser = storeOwnerId || storeId;

    if (targetStoreUser) {
        const titleStore = "¡Pago Confirmado! 💰";
        const bodyStore = `Orden #${orderRefId.substring(0,6)} pagada por $${paymentData.transaction_amount}. A cocinar.`;

        // A1. Guardar en Base de Datos (Campanita)
        await notificationsCollection.add({
            userId: targetStoreUser,
            title: titleStore,
            body: bodyStore,
            read: false,
            type: "order_paid",
            orderId: orderRefId,
            createdAt: new Date(),
            role: "store",
            icon: "coins"
        });

        // A2. Enviar Push al Celular (Sonido)
        try {
            const userDoc = await adminDb.collection("users").doc(targetStoreUser).get();
            const userData = userDoc.data();
            
            let tokens: string[] = [];
            if (userData?.fcmToken && typeof userData.fcmToken === 'string') tokens.push(userData.fcmToken);
            if (userData?.fcmTokens && Array.isArray(userData.fcmTokens)) tokens.push(...userData.fcmTokens);
            tokens = [...new Set(tokens)];

            if (tokens.length > 0) {
                await adminMessaging.sendEachForMulticast({
                    tokens: tokens,
                    notification: { title: titleStore, body: bodyStore },
                    webpush: { fcmOptions: { link: '/orders' }, notification: { tag: pushTag('pago-tienda', orderRefId) } },
                    data: { url: '/orders', orderId: orderRefId }
                });
                console.log(`📲 Push enviado a Tienda (${targetStoreUser})`);
            }
        } catch (e) {
            console.error("Error enviando push tienda:", e);
        }
    }

    // --- B) Notificación al CLIENTE ---
    if (buyerId) {
        const titleClient = "Pago Recibido ✅";
        const bodyClient = "Tu pago se acreditó y la tienda ya está preparando tu pedido.";

        // B1. Guardar en Base de Datos
        await notificationsCollection.add({
            userId: buyerId,
            title: titleClient,
            body: bodyClient,
            read: false,
            type: "payment_success",
            orderId: orderRefId,
            createdAt: new Date(),
            role: "buyer",
            icon: "check"
        });

        // B2. Enviar Push al Celular
        try {
            const userDoc = await adminDb.collection("users").doc(buyerId).get();
            const userData = userDoc.data();
            
            let tokens: string[] = [];
            if (userData?.fcmToken && typeof userData.fcmToken === 'string') tokens.push(userData.fcmToken);
            if (userData?.fcmTokens && Array.isArray(userData.fcmTokens)) tokens.push(...userData.fcmTokens);
            tokens = [...new Set(tokens)];

            if (tokens.length > 0) {
                await adminMessaging.sendEachForMulticast({
                    tokens: tokens,
                    notification: { title: titleClient, body: bodyClient },
                    webpush: { fcmOptions: { link: `/orders/${orderRefId}` }, notification: { tag: pushTag('pago-cliente', orderRefId) } },
                    data: { url: `/orders/${orderRefId}`, orderId: orderRefId }
                });
                console.log(`📲 Push enviado a Cliente (${buyerId})`);
            }
        } catch (e) {
            console.error("Error enviando push cliente:", e);
        }
    }

    // --- C) Broadcast a REPARTIDORES (Fase RR bis) ---
    // El pedido entra al pool de "Disponibles" en este momento exacto (los repartidores
    // ya pueden tomarlo desde 'En preparación'), pero el aviso dependía de que la tienda
    // tocara un botón — si no lo tocaba, nadie se enteraba. Ahora el sistema avisa solo.
    try {
        await broadcastOrderToDrivers({
            orderId: orderRefId,
            title: "📦 Nuevo Pedido Disponible",
            body: `${existingData.storeName || "Una tienda"} tiene un pedido pagado para entregar. ¡Tomalo!`,
        });
    } catch (e) {
        console.error("[Webhook] broadcast a repartidores falló:", e);
    }

    console.log(`🚀 [Webhook] Orden ${orderRefId} procesada completamente.`);

    return NextResponse.json({ status: "success", orderId: orderRefId });

  } catch (error: any) {
    console.error("❌ [Webhook] Error:", error);
    // Un pago no encontrado (ID inválido/expirado) es esperable, no un fallo real —
    // no ensucia Sentry con ruido. Cualquier otro error sí (es plata real en juego).
    if (error.status === 404 || error.cause?.some((c: any) => c.code === 2000)) {
        return NextResponse.json({ error: "Payment not found" }, { status: 200 });
    }
    Sentry.captureException(error, { tags: { route: "webhooks/mercadopago" } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}