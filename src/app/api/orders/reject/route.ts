import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyStoreOwnership } from "@/lib/auth-server";
import { returnStockForOrder } from "@/lib/stock-service";
import { notifyUser } from "@/lib/notify-server";

/**
 * La tienda rechaza un pedido que todavía no confirmó.
 *
 * Por qué existe: rechazar era un `updateDoc` directo del cliente (dos caminos distintos:
 * `store-orders-view.tsx` y `order-status-updater.tsx`). Como no pasaba por el servidor, las
 * unidades que `/api/orders/create` había reservado no se devolvían nunca — el pedido moría
 * y el stock quedaba descontado para siempre.
 *
 * Al moverlo acá, la devolución de stock ocurre en el mismo lugar que el cambio de estado y
 * no puede saltearse: la regla de Firestore ya no deja escribir 'Rechazado' desde el cliente.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "orders:reject", 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { orderId, reason } = await request.json();
    if (!orderId) return NextResponse.json({ error: "Falta orderId" }, { status: 400 });

    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    const order = orderSnap.data()!;

    // El dueño real de la tienda es `stores/{id}.ownerId`, no lo que mande el cliente.
    if (!order.storeId || !(await verifyStoreOwnership(callerUid, order.storeId))) {
      return NextResponse.json({ error: "Este pedido no pertenece a tu tienda." }, { status: 403 });
    }

    // Mismo criterio que la regla de Firestore que se está reemplazando: solo se rechaza
    // ANTES de confirmar. Después ya hay plata o logística en juego y el camino es cancelar
    // (que además registra el pasivo si el pedido estaba pagado).
    if (order.status !== "Pendiente de Confirmación") {
      return NextResponse.json(
        { error: `No se puede rechazar un pedido en estado "${order.status}".` },
        { status: 400 },
      );
    }

    const rejectionReason = String(reason || "").trim().slice(0, 300);

    await orderRef.update({
      status: "Rechazado",
      rejectedAt: Timestamp.now(),
      rejectedByStore: callerUid,
      ...(rejectionReason ? { rejectionReason } : {}),
      updatedAt: Timestamp.now(),
    });

    // Devolver las unidades reservadas. El pedido nunca se preparó, así que vuelven enteras.
    const stockResult = await returnStockForOrder(orderId, { reason: "rejected" });

    await notifyUser({
      userId: order.userId,
      title: "Tu pedido fue rechazado",
      body: rejectionReason
        ? `${order.storeName || "La tienda"} no pudo tomar tu pedido. Motivo: ${rejectionReason}`
        : `${order.storeName || "La tienda"} no pudo tomar tu pedido en este momento. No se te cobró nada.`,
      type: "order_status",
      orderId,
    });

    return NextResponse.json({
      success: true,
      unitsReturned: stockResult.unitsReturned,
    });
  } catch (error: any) {
    console.error("❌ Error rechazando pedido:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
