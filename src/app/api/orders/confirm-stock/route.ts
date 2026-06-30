import { NextResponse } from "next/server";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyStoreOwnership } from "@/lib/auth-server";

const FIXED_SHIPPING_COST = 2000;

// Reemplaza al "Tengo Stock" todo-o-nada: la tienda puede confirmar el pedido sacando
// ítems puntuales sin stock. El total SIEMPRE se recalcula acá (nunca se confía en un
// total que mande el cliente) a partir de los precios ya verificados al crear la orden.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'orders:confirm-stock', 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes. Espera un momento." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { orderId, storeId, removedItemIds } = body;

    if (!orderId || !storeId) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // 🔒 Solo el dueño real de la tienda (probado por su token + stores/{id}.ownerId)
    // puede confirmar stock de sus pedidos -- antes alcanzaba con mandar cualquier storeId.
    const callerUid = await verifyAuthToken(request);
    if (!callerUid) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!(await verifyStoreOwnership(callerUid, storeId))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const removedIds: string[] = Array.isArray(removedItemIds) ? removedItemIds : [];

    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    const orderData = orderSnap.data()!;

    if (orderData.storeId !== storeId) {
      return NextResponse.json({ error: "Este pedido no pertenece a tu tienda." }, { status: 403 });
    }
    if (orderData.status !== "Pendiente de Confirmación") {
      return NextResponse.json({ error: "Este pedido ya no está pendiente de confirmación." }, { status: 400 });
    }

    const originalItems: any[] = orderData.items || [];
    const removedItems = originalItems.filter((it) => removedIds.includes(it.id));
    const keptItems = originalItems.filter((it) => !removedIds.includes(it.id));

    if (keptItems.length === 0) {
      return NextResponse.json({ error: "No se puede confirmar un pedido sin productos. Rechazalo en su lugar." }, { status: 400 });
    }

    // Recalcular SIEMPRE desde los precios ya verificados al crear la orden (nunca un
    // total mandado por el cliente).
    const platformConfigSnap = await adminDb.collection("config").doc("platform").get();
    const serviceFeePercent = platformConfigSnap.data()?.serviceFee ?? 5;

    const newSubtotal = keptItems.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
    const newServiceFee = (newSubtotal * serviceFeePercent) / 100;
    const newTotal = newSubtotal + FIXED_SHIPPING_COST + newServiceFee;

    await orderRef.update({
      items: keptItems,
      subtotal: newSubtotal,
      serviceFee: newServiceFee,
      total: newTotal,
      status: "Pendiente de Pago",
      updatedAt: Timestamp.now(),
      ...(removedItems.length > 0 ? { removedItems } : {}),
    });

    // Notificar al comprador qué se sacó (si algo se sacó) y el nuevo total.
    const notifTitle = removedItems.length > 0 ? "⚠️ Stock parcial confirmado" : "✅ Stock Confirmado";
    const notifBody = removedItems.length > 0
      ? `La tienda no tenía: ${removedItems.map((it) => it.title || it.name).join(", ")}. Nuevo total: $${newTotal.toFixed(0)}. Ya puedes pagar.`
      : "Puedes proceder al pago.";

    await adminDb.collection("notifications").add({
      userId: orderData.userId,
      title: notifTitle,
      body: notifBody,
      type: "order_status",
      orderId,
      read: false,
      createdAt: Timestamp.now(),
      icon: "store",
    });

    try {
      const buyerDoc = await adminDb.collection("users").doc(orderData.userId).get();
      const buyerData = buyerDoc.data();
      let tokens: string[] = [];
      if (buyerData?.fcmToken && typeof buyerData.fcmToken === "string") tokens.push(buyerData.fcmToken);
      if (buyerData?.fcmTokens && Array.isArray(buyerData.fcmTokens)) tokens.push(...buyerData.fcmTokens);
      tokens = [...new Set(tokens)];

      if (tokens.length > 0) {
        await adminMessaging.sendEachForMulticast({
          tokens,
          notification: { title: notifTitle, body: notifBody },
          webpush: { fcmOptions: { link: `/orders/${orderId}` } },
          data: { url: `/orders/${orderId}`, orderId },
        });
      }
    } catch (pushError) {
      console.error("Error enviando push de confirmación al comprador:", pushError);
    }

    return NextResponse.json({ success: true, total: newTotal, removedCount: removedItems.length });
  } catch (error: any) {
    console.error("❌ Error confirmando stock:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
