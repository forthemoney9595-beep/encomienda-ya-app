import { NextResponse } from "next/server";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken } from "@/lib/auth-server";
import { notifyUser } from "@/lib/notify-server";

// El repartidor suelta un pedido que tomó pero no puede completar -- ANTES de
// retirarlo de la tienda. Va por API (no por escritura directa permitida en
// firestore.rules) por tres motivos: (1) necesita re-broadcastear a los demás
// repartidores, que solo se puede hacer con Admin SDK (las reglas no dejan a un
// repartidor listar otros usuarios); (2) exige un motivo, para dejar rastro;
// (3) deja un registro en driver_incidents para que el admin note patrones de
// acaparamiento o un repartidor problemático -- ver análisis de abuso en el chat:
// sin esto, "soltar" libre y gratis permite tomar todos los pedidos disponibles,
// quedarse con el mejor y soltar el resto, dejando a los demás repartidores sin
// verlos mientras tanto.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'orders:release', 10, 60_000);
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
    // Solo antes de retirar -- una vez que tiene el producto en la mano, soltarlo no
    // tiene sentido (nadie más puede "recibirlo" de él); a partir de ahí es
    // /api/orders/report-problem, que no borra al repartidor de la orden.
    if (orderData.status !== "En camino") {
      return NextResponse.json({
        error: orderData.status === "En reparto"
          ? "Ya retiraste el pedido -- usá \"Reportar problema\" en su lugar."
          : "Este pedido ya no está en un estado que se pueda soltar.",
      }, { status: 400 });
    }

    const reasonText = reason.toString().trim().slice(0, 300);
    const driverName = orderData.deliveryPersonName || "Un repartidor";

    await orderRef.update({
      deliveryPersonId: null,
      deliveryPersonName: null,
      status: "Listo para recoger",
      takenAt: null,
    });

    await adminDb.collection("driver_incidents").add({
      type: "released",
      driverId: callerUid,
      driverName,
      orderId,
      storeId: orderData.storeId || null,
      storeName: orderData.storeName || null,
      reason: reasonText,
      resolved: false,
      createdAt: Timestamp.now(),
    });

    // Avisar a la tienda que sigue buscando repartidor.
    if (orderData.storeOwnerId) {
      await adminDb.collection("notifications").add({
        userId: orderData.storeOwnerId,
        title: "🔄 Buscando otro repartidor",
        body: `${driverName} no pudo continuar con el pedido. Estamos avisando a otros repartidores.`,
        type: "order_status",
        orderId,
        read: false,
        createdAt: Timestamp.now(),
      });
    }

    // Avisar al COMPRADOR (Fase PP): antes su repartidor asignado desaparecía sin
    // explicación — la tienda se enteraba pero el dueño del pedido no.
    if (orderData.userId) {
      await notifyUser({
        userId: orderData.userId,
        title: "🔄 Cambio de repartidor",
        body: "El repartidor no pudo continuar con tu pedido. Ya estamos buscando otro — no hace falta que hagas nada.",
        type: "order_status",
        orderId,
      });
    }

    // Re-broadcast a repartidores aprobados y disponibles (mismo criterio que
    // /api/orders/notify-drivers).
    const driversSnap = await adminDb.collection("users")
      .where("role", "==", "delivery")
      .where("isApproved", "==", true)
      .get();
    const onlineDrivers = driversSnap.docs.filter(d => d.data().isOnline !== false && d.id !== callerUid);
    if (onlineDrivers.length > 0) {
      const batch = adminDb.batch();
      onlineDrivers.forEach((driverDoc) => {
        const notifRef = adminDb.collection("notifications").doc();
        batch.set(notifRef, {
          userId: driverDoc.id,
          title: "📦 Pedido Disponible",
          body: `${orderData.storeName || "Una tienda"} tiene un pedido liberado. ¡Aceptalo!`,
          type: "delivery_request",
          orderId,
          read: false,
          createdAt: Timestamp.now(),
          icon: "alert",
        });
      });
      await batch.commit();

      // 🔔 PUSH (Fase PP) — mismo hueco que notify-drivers: solo campanita, el celular
      // cerrado nunca sonaba.
      try {
        const tokens: string[] = [];
        for (const d of onlineDrivers) {
          const u = d.data();
          if (u.fcmToken) tokens.push(u.fcmToken);
          if (Array.isArray(u.fcmTokens)) tokens.push(...u.fcmTokens);
        }
        const uniq = [...new Set(tokens)].filter(Boolean);
        if (uniq.length > 0) {
          await adminMessaging.sendEachForMulticast({
            tokens: uniq,
            notification: {
              title: "📦 Pedido Disponible",
              body: `${orderData.storeName || "Una tienda"} tiene un pedido liberado. ¡Aceptalo!`,
            },
            webpush: { fcmOptions: { link: "/orders" } },
            data: { url: "/orders" },
          });
        }
      } catch (e) {
        console.error("[release] push falló:", e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error soltando pedido:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
