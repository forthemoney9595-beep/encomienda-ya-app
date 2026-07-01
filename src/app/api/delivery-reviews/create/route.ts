import { NextResponse } from "next/server";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";
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

    await reviewRef.set({
      driverId,
      orderId,
      userId,
      userName: orderData.customerName || "Cliente",
      rating: ratingNum,
      comment: commentText,
      createdAt: Timestamp.now(),
    });

    // También queda en la orden (mismo lugar de siempre) para no romper las vistas que
    // ya leen order.deliveryRating/deliveryReview (dashboard admin, ficha del repartidor).
    await orderRef.update({
      deliveryReviewed: true,
      deliveryRating: ratingNum,
      deliveryReview: commentText,
    });

    // 2. Actualizar el promedio del repartidor (users/{driverId}.rating), mismo patrón
    // que stores/{id}.rating, con una transacción para que sume bien aunque lleguen
    // reseñas al mismo tiempo.
    const driverRef = adminDb.collection("users").doc(driverId);
    await adminDb.runTransaction(async (tx) => {
      const driverSnap = await tx.get(driverRef);
      const driverData = driverSnap.data() || {};
      const ratingSum = (driverData.ratingSum || 0) + ratingNum;
      const ratingCount = (driverData.ratingCount || 0) + 1;
      tx.update(driverRef, {
        ratingSum,
        ratingCount,
        rating: ratingSum / ratingCount,
      });
    });

    // 3. Notificar al repartidor (campana + push).
    const notifTitle = "⭐ Nueva reseña";
    const notifBody = `${orderData.customerName || "Un cliente"} calificó tu entrega con ${ratingNum} estrella${ratingNum === 1 ? "" : "s"}.`;

    await adminDb.collection("notifications").add({
      userId: driverId,
      title: notifTitle,
      body: notifBody,
      type: "delivery_review",
      read: false,
      createdAt: Timestamp.now(),
      icon: "star",
    });

    try {
      const driverUserDoc = await adminDb.collection("users").doc(driverId).get();
      const driverUserData = driverUserDoc.data();
      let tokens: string[] = [];
      if (driverUserData?.fcmToken && typeof driverUserData.fcmToken === "string") tokens.push(driverUserData.fcmToken);
      if (driverUserData?.fcmTokens && Array.isArray(driverUserData.fcmTokens)) tokens.push(...driverUserData.fcmTokens);
      tokens = [...new Set(tokens)];

      if (tokens.length > 0) {
        await adminMessaging.sendEachForMulticast({
          tokens,
          notification: { title: notifTitle, body: notifBody },
          webpush: { fcmOptions: { link: "/delivery/reviews" } },
          data: { url: "/delivery/reviews" },
        });
      }
    } catch (pushError) {
      console.error("Error enviando push de reseña al repartidor:", pushError);
    }

    return NextResponse.json({ success: true, reviewId: reviewRef.id });
  } catch (error: any) {
    console.error("❌ Error creando reseña de repartidor:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
