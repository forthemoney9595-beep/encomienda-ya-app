import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken } from "@/lib/auth-server";
import { notifyUser } from "@/lib/notify-server";

// El repartidor reporta un problema DESPUÉS de retirar el pedido de la tienda (ya tiene
// el producto físico). A propósito NO cancela ni cambia el estado de la orden -- a
// diferencia de "soltar" (antes de retirar), acá el repartidor no puede resolverlo por su
// cuenta: dejarlo cancelar directo abriría la puerta a quedarse con el producto sin
// entregarlo y borrar el pedido para taparlo. Solo deja un registro para que el admin
// decida (cancelar+reembolsar via /admin/orders, reasignar, contactar al cliente, etc.).
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'orders:report-problem', 10, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes. Espera un momento." }, { status: 429 });
  }

  try {
    const { orderId, reason } = await request.json();
    if (!orderId || !reason || !reason.toString().trim()) {
      return NextResponse.json({ error: "Falta el motivo." }, { status: 400 });
    }

    const callerUid = await verifyAuthToken(request);
    if (!callerUid) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    const orderData = orderSnap.data()!;

    if (orderData.deliveryPersonId !== callerUid) {
      return NextResponse.json({ error: "Este pedido no está asignado a vos." }, { status: 403 });
    }
    if (orderData.status !== "En reparto") {
      return NextResponse.json({
        error: orderData.status === "En camino"
          ? "Todavía no retiraste el pedido -- usá \"Soltar pedido\" en su lugar."
          : "Este pedido ya no está en un estado que se pueda reportar.",
      }, { status: 400 });
    }

    const reasonText = reason.toString().trim().slice(0, 300);
    const driverName = orderData.deliveryPersonName || "Un repartidor";

    // No toca status ni deliveryPersonId -- el pedido sigue siendo responsabilidad de
    // este repartidor hasta que el admin decida algo distinto.
    await orderRef.update({ hasReportedProblem: true });

    await adminDb.collection("driver_incidents").add({
      type: "problem_reported",
      driverId: callerUid,
      driverName,
      orderId,
      storeId: orderData.storeId || null,
      storeName: orderData.storeName || null,
      reason: reasonText,
      resolved: false,
      createdAt: Timestamp.now(),
    });

    if (orderData.storeOwnerId) {
      await adminDb.collection("notifications").add({
        userId: orderData.storeOwnerId,
        title: "⚠️ Problema con la entrega",
        body: `${driverName} reportó un problema con un pedido ya retirado. El admin fue avisado.`,
        type: "order_status",
        orderId,
        read: false,
        createdAt: Timestamp.now(),
      });
    }

    // Avisar a los ADMINS de verdad (Fase PP): el mensaje de arriba decía "el admin fue
    // avisado" desde la Fase T... pero ningún aviso al admin existía — solo el doc en
    // driver_incidents, visible recién si alguien entraba a mirar la bandeja.
    try {
      const adminsSnap = await adminDb.collection("roles_admin").get();
      for (const a of adminsSnap.docs) {
        await notifyUser({
          userId: a.id,
          title: "🚨 Problema reportado en un reparto",
          body: `${driverName} reportó: "${reasonText}" — pedido de ${orderData.storeName || 'una tienda'} ya retirado. Requiere tu decisión.`,
          type: "order_status",
          orderId,
        });
      }
    } catch (e) {
      console.error("[report-problem] aviso a admins falló:", e);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error reportando problema:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
