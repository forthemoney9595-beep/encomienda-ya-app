import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { notifyUser } from "@/lib/notify-server";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken } from "@/lib/auth-server";

// Mismo criterio que /api/reviews/create (calificar tienda), aplicado a calificar al
// repartidor. Antes esto era un updateDoc directo del cliente sobre la propia orden
// (deliveryRating/deliveryReview) sin pasar por ninguna API: no validaba que el pedido
// estuviera Entregado, no evitaba calificar dos veces, y no mantenía ningún promedio --
// el admin lo recalculaba al vuelo escaneando todos los pedidos del repartidor cada vez.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'delivery-reviews:create', 5, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes. Espera un momento." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { orderId, userId, rating, comment } = body;

    if (!orderId || !userId || !rating) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // 🔒 Solo el comprador real (probado por su token) puede calificar, no cualquiera
    // que adivine un orderId+userId.
    const callerUid = await verifyAuthToken(request);
    if (!callerUid) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (callerUid !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json({ error: "La calificación debe ser un número entre 1 y 5." }, { status: 400 });
    }

    // 1. Verificar el pedido: del comprador, ya entregado, con repartidor asignado, y
    // no calificado todavía.
    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    const orderData = orderSnap.data()!;

    if (orderData.userId !== userId) {
      return NextResponse.json({ error: "Este pedido no te pertenece." }, { status: 403 });
    }
    if (orderData.status !== "Entregado") {
      return NextResponse.json({ error: "Solo se puede calificar un pedido entregado." }, { status: 400 });
    }
    const driverId = orderData.deliveryPersonId;
    if (!driverId) {
      return NextResponse.json({ error: "Este pedido no tiene repartidor asignado." }, { status: 400 });
    }
    if (orderData.deliveryReviewed) {
      return NextResponse.json({ error: "Ya calificaste a este repartidor por este pedido." }, { status: 400 });
    }

    const reviewRef = adminDb.collection("deliveryReviews").doc();
    const commentText = (comment || "").toString().slice(0, 1000);
    const driverRef = adminDb.collection("users").doc(driverId);

    // 🔒 Tanda B de la auditoría: TODO en UNA transacción con el "una sola vez"
    // (`deliveryReviewed`) re-chequeado ADENTRO — mismo fix que /api/reviews/create:
    // dos requests simultáneas ya no pueden crear dos reseñas ni sumar el rating doble.
    try {
      await adminDb.runTransaction(async (tx) => {
        const freshOrder = await tx.get(orderRef);
        if (!freshOrder.exists || freshOrder.data()!.deliveryReviewed) {
          throw new Error('__ALREADY_REVIEWED__');
        }
        const driverSnap = await tx.get(driverRef);
        const driverData = driverSnap.data() || {};
        const ratingSum = (driverData.ratingSum || 0) + ratingNum;
        const ratingCount = (driverData.ratingCount || 0) + 1;

        tx.set(reviewRef, {
          driverId,
          orderId,
          userId,
          userName: orderData.customerName || "Cliente",
          rating: ratingNum,
          comment: commentText,
          createdAt: Timestamp.now(),
        });
        // También queda en la orden (mismo lugar de siempre) para no romper las vistas
        // que ya leen order.deliveryRating/deliveryReview (dashboard, ficha del admin).
        tx.update(orderRef, {
          deliveryReviewed: true,
          deliveryRating: ratingNum,
          deliveryReview: commentText,
        });
        tx.update(driverRef, {
          ratingSum,
          ratingCount,
          rating: ratingSum / ratingCount,
        });
      });
    } catch (e: any) {
      if (e?.message === '__ALREADY_REVIEWED__') {
        return NextResponse.json({ error: "Ya calificaste a este repartidor por este pedido." }, { status: 400 });
      }
      throw e;
    }

    // 3. Notificar al repartidor — via notifyUser (Fase PP): la campanita vieja no
    // llevaba `link` y tocarla no navegaba a ningún lado.
    await notifyUser({
      userId: driverId,
      title: "⭐ Nueva reseña",
      body: `${orderData.customerName || "Un cliente"} calificó tu entrega con ${ratingNum} estrella${ratingNum === 1 ? "" : "s"}.`,
      type: "delivery_review",
      link: "/delivery/reviews",
    });

    return NextResponse.json({ success: true, reviewId: reviewRef.id });
  } catch (error: any) {
    console.error("❌ Error creando reseña de repartidor:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
