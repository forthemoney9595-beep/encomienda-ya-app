import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Avisa a TODOS los repartidores que un pedido está listo para retirar.
// Va por API (Admin SDK) porque las reglas de Firestore no le permiten a una
// tienda leer la lista completa de usuarios — solo un admin puede, así que la
// consulta directa desde el cliente fallaba con permission-denied.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'orders:notify-drivers', 10, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: "Falta orderId" }, { status: 400 });
    }

    const orderSnap = await adminDb.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }
    const storeName = orderSnap.data()?.storeName || "La tienda";

    const driversSnap = await adminDb.collection("users").where("role", "==", "delivery").get();
    if (driversSnap.empty) {
      return NextResponse.json({ notified: 0, message: "No hay repartidores registrados" });
    }

    const batch = adminDb.batch();
    driversSnap.forEach((driverDoc) => {
      const notifRef = adminDb.collection("notifications").doc();
      batch.set(notifRef, {
        userId: driverDoc.id,
        title: "📦 Nuevo Pedido Disponible",
        body: `La tienda ${storeName} tiene un pedido listo. ¡Aceptalo rápido!`,
        type: "delivery_request",
        orderId,
        read: false,
        createdAt: Timestamp.now(),
        icon: "alert",
      });
    });
    await batch.commit();

    return NextResponse.json({ notified: driversSnap.size });
  } catch (error: any) {
    console.error("❌ [Notify Drivers] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
