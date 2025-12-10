import { NextResponse } from "next/server";
import MercadoPagoConfig, { Payment } from "mercadopago";
import { adminDb } from "@/lib/firebase-admin";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const queryId = url.searchParams.get("id") || url.searchParams.get("data.id");
    const body = await request.json().catch(() => ({}));
    const paymentId = queryId || body?.data?.id;
    const type = body?.type || url.searchParams.get("topic") || url.searchParams.get("type");

    console.log(`🔔 [Webhook V5 Final] Notificación recibida. ID: ${paymentId}, Type: ${type}`);

    if (!paymentId || type !== "payment") {
        return NextResponse.json({ status: "ignored_not_payment" });
    }

    // 1. Validar Pago
    const payment = new Payment(client);
    const paymentData = await payment.get({ id: paymentId });

    if (paymentData.status !== "approved") {
      return NextResponse.json({ status: "received_but_not_approved" });
    }

    // 3. Extraer Metadata Segura
    const { metadata } = paymentData;
    const buyerId = metadata.buyer_id;
    const storeId = metadata.store_id; // ID del Documento de la Tienda
    const storeOwnerId = metadata.store_owner_id; // ✅ NUEVO: ID del Dueño (Usuario)
    const orderRefId = metadata.order_id;

    if (!orderRefId) return NextResponse.json({ error: "No order ID" }, { status: 400 });

    console.log(`✅ [Webhook] Pago Aprobado. Procesando Orden ${orderRefId}...`);

    const ordersCollection = adminDb.collection("orders");
    const notificationsCollection = adminDb.collection("notifications");
    
    // 2. Preparar Datos de Actualización
    // Mantenemos 'En preparación' para que la Tienda lo vea en su panel
    const updateData = {
        paymentStatus: "paid",
        status: "En preparación", 
        mpPaymentId: paymentId,
        updatedAt: new Date(),
        readyForPickup: false 
    };

    // 3. Ejecutar Actualización
    await ordersCollection.doc(orderRefId).set(updateData, { merge: true });

    // 4. NOTIFICACIONES (CORREGIDO)
    
    // A) Notificación a la TIENDA
    // Usamos el ID del Dueño. Si por alguna razón falla, usamos el de la tienda como respaldo.
    const targetStoreUser = storeOwnerId || storeId;

    if (targetStoreUser) {
        await notificationsCollection.add({
            userId: targetStoreUser, // ✅ CORREGIDO: Ahora va al usuario dueño
            title: "¡Pago Confirmado! 💰",
            body: `Orden #${orderRefId.substring(0,6)} pagada por $${paymentData.transaction_amount}. Comienza la preparación.`,
            read: false,
            type: "order_paid",
            orderId: orderRefId,
            createdAt: new Date(),
            role: "store"
        });
        console.log(`📨 Notificación enviada a Dueño Tienda (${targetStoreUser})`);
    } else {
        console.warn("⚠️ No se encontró ID de dueño para notificar a la tienda.");
    }

    // B) Notificación al CLIENTE
    if (buyerId) {
        await notificationsCollection.add({
            userId: buyerId,
            title: "Pago Recibido ✅",
            body: "La tienda está preparando tu pedido.",
            read: false,
            type: "payment_success",
            orderId: orderRefId,
            createdAt: new Date(),
            role: "buyer"
        });
        console.log(`📨 Notificación enviada a Cliente (${buyerId})`);
    }

    console.log(`🚀 [Webhook] Orden ${orderRefId} actualizada a 'En preparación'.`);
    
    return NextResponse.json({ status: "success", orderId: orderRefId });

  } catch (error: any) {
    console.error("❌ [Webhook] Error:", error);
    if (error.status === 404 || error.cause?.some((c: any) => c.code === 2000)) {
        return NextResponse.json({ error: "Payment not found" }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}