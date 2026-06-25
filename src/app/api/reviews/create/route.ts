import { NextResponse } from "next/server";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'reviews:create', 5, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes. Espera un momento." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { orderId, userId, rating, comment } = body;

    if (!orderId || !userId || !rating) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json({ error: "La calificación debe ser un número entre 1 y 5." }, { status: 400 });
    }

    // 1. Verificar el pedido: tiene que ser de este comprador, ya entregado, y no
    // calificado todavía (mismo criterio que ya usa la calificación de productos).
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
    if (orderData.storeReviewed) {
      return NextResponse.json({ error: "Ya calificaste este pedido." }, { status: 400 });
    }

    const storeId = orderData.storeId;
    const reviewRef = adminDb.collection("reviews").doc();

    await reviewRef.set({
      storeId,
      orderId,
      userId,
      userName: orderData.customerName || "Cliente",
      rating: ratingNum,
      comment: (comment || "").toString().slice(0, 1000),
      createdAt: Timestamp.now(),
    });

    await orderRef.update({ storeReviewed: true });

    // 2. Actualizar el promedio de la tienda (mismo store.rating que ya se lee en
    // Inicio y en el detalle de tienda) con una transacción para que sume bien aunque
    // lleguen reseñas al mismo tiempo.
    const storeRef = adminDb.collection("stores").doc(storeId);
    await adminDb.runTransaction(async (tx) => {
      const storeSnap = await tx.get(storeRef);
      const storeData = storeSnap.data() || {};
      const ratingSum = (storeData.ratingSum || 0) + ratingNum;
      const ratingCount = (storeData.ratingCount || 0) + 1;
      tx.update(storeRef, {
        ratingSum,
        ratingCount,
        rating: ratingSum / ratingCount,
      });
    });

    // 3. Notificar al dueño (campana + push), mismo patrón que orders/create.
    const ownerId = orderData.storeOwnerId;
    if (ownerId) {
      const notifTitle = "⭐ Nueva reseña";
      const notifBody = `${orderData.customerName || "Un cliente"} calificó tu tienda con ${ratingNum} estrella${ratingNum === 1 ? "" : "s"}.`;

      await adminDb.collection("notifications").add({
        userId: ownerId,
        title: notifTitle,
        body: notifBody,
        type: "store_review",
        read: false,
        createdAt: Timestamp.now(),
        icon: "star",
      });

      try {
        const ownerUserDoc = await adminDb.collection("users").doc(ownerId).get();
        const ownerUserData = ownerUserDoc.data();
        let tokens: string[] = [];
        if (ownerUserData?.fcmToken && typeof ownerUserData.fcmToken === "string") tokens.push(ownerUserData.fcmToken);
        if (ownerUserData?.fcmTokens && Array.isArray(ownerUserData.fcmTokens)) tokens.push(...ownerUserData.fcmTokens);
        tokens = [...new Set(tokens)];

        if (tokens.length > 0) {
          await adminMessaging.sendEachForMulticast({
            tokens,
            notification: { title: notifTitle, body: notifBody },
            webpush: { fcmOptions: { link: "/my-store/reviews" } },
            data: { url: "/my-store/reviews" },
          });
        }
      } catch (pushError) {
        console.error("Error enviando push de reseña al dueño:", pushError);
      }
    }

    return NextResponse.json({ success: true, reviewId: reviewRef.id });
  } catch (error: any) {
    console.error("❌ Error creando reseña:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
