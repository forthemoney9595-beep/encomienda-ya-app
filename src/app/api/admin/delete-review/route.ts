import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuthToken, verifyAdmin } from "@/lib/auth-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Elimina una reseña y recalcula el rating de la tienda.
// Es el proceso inverso de /api/reviews/create.
// Moderar reseñas es tarea operativa legítima: cualquier nivel de admin (incl. 'support').
export async function POST(request: Request) {
  // Fase PP-P5: era la ÚNICA ruta admin sin rate limit (tocaba el rating de tiendas sin tope).
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'admin:delete-review', 20, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!(await verifyAdmin(callerUid))) {
    return NextResponse.json({ error: "Se requiere rol admin" }, { status: 403 });
  }

  try {
    const { reviewId } = await request.json();
    if (!reviewId) return NextResponse.json({ error: "Falta reviewId" }, { status: 400 });

    const reviewSnap = await adminDb.collection('reviews').doc(reviewId).get();
    if (!reviewSnap.exists) return NextResponse.json({ error: "Reseña no encontrada" }, { status: 404 });

    const review = reviewSnap.data()!;
    const { storeId, rating } = review;

    await adminDb.runTransaction(async (tx) => {
      const storeRef = adminDb.collection('stores').doc(storeId);
      const storeSnap = await tx.get(storeRef);
      const storeData = storeSnap.data();

      if (storeData) {
        const currentSum = storeData.ratingSum || 0;
        const currentCount = storeData.ratingCount || 1;
        const newCount = Math.max(0, currentCount - 1);
        const newSum = Math.max(0, currentSum - (rating || 0));
        const newRating = newCount > 0 ? newSum / newCount : 0;

        tx.update(storeRef, {
          ratingSum: newSum,
          ratingCount: newCount,
          rating: newRating,
        });
      }

      tx.delete(adminDb.collection('reviews').doc(reviewId));

      // Si la orden tiene storeReviewed, limpiarlo para que el comprador pueda calificar de nuevo
      if (review.orderId) {
        const orderRef = adminDb.collection('orders').doc(review.orderId);
        tx.update(orderRef, { storeReviewed: FieldValue.delete() });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error eliminando reseña:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
