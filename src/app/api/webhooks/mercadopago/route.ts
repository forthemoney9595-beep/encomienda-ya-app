import { NextResponse } from "next/server";
import MercadoPagoConfig, { Payment } from "mercadopago";
// ✅ Importamos adminMessaging para enviar PUSH
import { adminDb, adminMessaging } from "@/lib/firebase-admin";

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

    console.log(`🔔 [Webhook] Notificación recibida. ID: ${paymentId}, Type: ${type}`);

    if (!paymentId || type !== "payment") {
        return NextResponse.json({ status: "ignored_not_payment" });
    }

    // 1. Validar Pago en MercadoPago
    const payment = new Payment(client);
    const paymentData = await payment.get({ id: paymentId });

    if (paymentData.status !== "approved") {
      return NextResponse.json({ status: "received_but_not_approved" });
    }

    // 2. Extraer Metadata
    const { metadata } = paymentData;
    const buyerId = metadata.buyer_id;
    const storeId = metadata.store_id; 
    const storeOwnerId = metadata.store_owner_id; 
    const orderRefId = metadata.order_id;

    if (!orderRefId) return NextResponse.json({ error: "No order ID" }, { status: 400 });

    console.log(`✅ [Webhook] Pago Aprobado. Procesando Orden ${orderRefId}...`);

    const ordersCollection = adminDb.collection("orders");
    const notificationsCollection = adminDb.collection("notifications");
    
    // 3. Actualizar la Orden en Firestore
    const updateData = {
        paymentStatus: "paid",
        status: "En preparación", // Pasa directo a cocina
        mpPaymentId: paymentId,
        updatedAt: new Date(),
        readyForPickup: false 
    };

    await ordersCollection.doc(orderRefId).set(updateData, { merge: true });

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
                    webpush: { fcmOptions: { link: '/orders' } },
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
                    webpush: { fcmOptions: { link: `/orders/${orderRefId}` } },
                    data: { url: `/orders/${orderRefId}`, orderId: orderRefId }
                });
                console.log(`📲 Push enviado a Cliente (${buyerId})`);
            }
        } catch (e) {
            console.error("Error enviando push cliente:", e);
        }
    }

    console.log(`🚀 [Webhook] Orden ${orderRefId} procesada completamente.`);
    
    return NextResponse.json({ status: "success", orderId: orderRefId });

  } catch (error: any) {
    console.error("❌ [Webhook] Error:", error);
    if (error.status === 404 || error.cause?.some((c: any) => c.code === 2000)) {
        return NextResponse.json({ error: "Payment not found" }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}