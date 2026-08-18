import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { notifyUser } from "@/lib/notify-server";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken } from "@/lib/auth-server";
import { publicName } from "@/lib/public-name";

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

    // 🔒 Solo el comprador real (probado por su token) puede dejar la reseña, no
    // cualquiera que adivine un orderId+userId.
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
    if (!storeId) {
      return NextResponse.json({ error: "El pedido no tiene tienda asociada." }, { status: 400 });
    }
    const reviewRef = adminDb.collection("reviews").doc();
    const storeRef = adminDb.collection("stores").doc(storeId);

    // 🔒 Tanda B de la auditoría: TODO en UNA transacción, con el "una sola vez"
    // (`storeReviewed`) re-chequeado ADENTRO. Antes el chequeo era read-then-write suelto
    // y la transacción solo protegía la suma: dos requests simultáneas del mismo pedido
    // creaban dos reseñas y sumaban el rating dos veces.
    try {
      await adminDb.runTransaction(async (tx) => {
        const freshOrder = await tx.get(orderRef);
        if (!freshOrder.exists || freshOrder.data()!.storeReviewed) {
          throw new Error('__ALREADY_REVIEWED__');
        }
        const storeSnap = await tx.get(storeRef);
        const storeData = storeSnap.data() || {};
        const ratingSum = (storeData.ratingSum || 0) + ratingNum;
        const ratingCount = (storeData.ratingCount || 0) + 1;

        // 🔒 Auditoría de privacidad (ago 2026): `reviews` es PÚBLICA (read: if true) —
        // el doc ya NO guarda `userId` (correlacionaba uid ↔ nombre real ↔ tienda ↔ fecha
        // para cualquiera con el SDK) y `userName` se guarda como nombre de pila +
        // inicial ("María G."), estándar Rappi. La trazabilidad para el admin queda por
        // `orderId` (las órdenes no son legibles públicamente).
        tx.set(reviewRef, {
          storeId,
          orderId,
          userName: publicName(orderData.customerName),
          rating: ratingNum,
          comment: (comment || "").toString().slice(0, 1000),
          createdAt: Timestamp.now(),
        });
        tx.update(orderRef, { storeReviewed: true });
        tx.update(storeRef, {
          ratingSum,
          ratingCount,
          rating: ratingSum / ratingCount,
        });
      });
    } catch (e: any) {
      if (e?.message === '__ALREADY_REVIEWED__') {
        return NextResponse.json({ error: "Ya calificaste este pedido." }, { status: 400 });
      }
      throw e;
    }

    // 3. Notificar al dueño — via notifyUser (Fase PP): la campanita vieja no llevaba
    // `link` y tocarla no navegaba (el push sí iba bien: incoherencia dentro del evento).
    const ownerId = orderData.storeOwnerId;
    if (ownerId) {
      await notifyUser({
        userId: ownerId,
        title: "⭐ Nueva reseña",
        body: `${publicName(orderData.customerName, "Un cliente")} calificó tu tienda con ${ratingNum} estrella${ratingNum === 1 ? "" : "s"}.`,
        type: "store_review",
        link: "/my-store/reviews",
      });
    }

    return NextResponse.json({ success: true, reviewId: reviewRef.id });
  } catch (error: any) {
    console.error("❌ Error creando reseña:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
