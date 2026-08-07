import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken } from "@/lib/auth-server";
import { notifyUser } from "@/lib/notify-server";
import * as Sentry from "@sentry/nextjs";
import {
  CLAIM_TYPES,
  DEFAULT_CLAIM_WINDOW_HOURS,
  STUCK_CLAIM_MIN_HOURS,
  STUCK_CLAIMABLE_STATUSES,
  lastMovementMillis,
  toMillis,
  type ClaimType,
} from "@/lib/claim-types";

// El comprador reporta un problema con su pedido (Fase NN). Mismo criterio que el
// "reportar problema" del repartidor (Fase T): el reclamo NO resuelve nada por sí solo,
// solo deja un registro estructurado para que el admin decida (reembolsar via
// /api/admin/refund-order, rechazar con motivo, o resolver por otra vía).
//
// Validaciones server-side (el cliente solo dibuja el formulario):
// - el pedido es del comprador autenticado, y un solo reclamo por pedido (order.claimId)
// - tipos post-entrega: pedido 'Entregado' y dentro de la ventana
//   config/platform.claimWindowHours (default 24h) contada desde deliveredAt
// - 'stuck_order': pedido pagado, en estado activo, y sin movimiento hace más de 1h
// - foto obligatoria según el tipo (mal estado / producto distinto), y el path tiene que
//   ser del propio comprador (claims/{uid}/...) -- no se aceptan paths arbitrarios
// - monto sugerido calculado acá (suma de ítems tildados o total), nunca del body
export async function POST(request: Request) {
  const ip = getClientIp(request);
  // 15/min: los intentos rechazados por validación (foto faltante, descripción corta)
  // también cuentan, y un usuario legítimo puede necesitar varios. El freno real contra
  // abuso es "un reclamo por pedido", no este límite.
  const { allowed } = checkRateLimit(ip, "claims:create", 15, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes. Espera un momento." }, { status: 429 });
  }

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { orderId, type, description, itemIds, photoPath } = await request.json();

    if (!orderId) return NextResponse.json({ error: "Falta orderId" }, { status: 400 });

    const meta = CLAIM_TYPES[type as ClaimType];
    if (!meta) return NextResponse.json({ error: "Tipo de reclamo inválido" }, { status: 400 });

    const descriptionText = String(description || "").trim().slice(0, 500);
    if (descriptionText.length < 10) {
      return NextResponse.json({ error: "Contanos un poco más qué pasó (mínimo 10 caracteres)." }, { status: 400 });
    }

    const photo = String(photoPath || "").trim();
    if (meta.requiresPhoto && !photo) {
      return NextResponse.json({ error: "Este tipo de reclamo necesita una foto del producto." }, { status: 400 });
    }
    // Solo un path subido por el propio comprador a su carpeta de evidencia. Nunca una
    // URL ni un path de otra carpeta (sería un oráculo para firmar archivos ajenos
    // vía /api/claims/photo-url).
    if (photo && !photo.startsWith(`claims/${callerUid}/`)) {
      return NextResponse.json({ error: "Foto de evidencia inválida." }, { status: 400 });
    }

    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    const order = orderSnap.data()!;

    if (order.userId !== callerUid) {
      return NextResponse.json({ error: "Este pedido no es tuyo." }, { status: 403 });
    }
    if (order.claimId) {
      return NextResponse.json({ error: "Este pedido ya tiene un reclamo abierto." }, { status: 400 });
    }

    const now = Date.now();

    if (meta.context === "delivered") {
      if (order.status !== "Entregado") {
        return NextResponse.json({ error: "Este tipo de reclamo es para pedidos ya entregados." }, { status: 400 });
      }

      // Ventana de reclamo: configurable en /admin/settings sin deploy (mismo patrón que
      // deliveryFee/serviceFee). deliveredAt puede faltar en pedidos viejos (se escribía
      // en 1 de los 3 caminos hasta la Fase NN) -- fallback al último timestamp conocido,
      // a favor del comprador.
      let windowHours = DEFAULT_CLAIM_WINDOW_HOURS;
      try {
        const cfg = await adminDb.collection("config").doc("platform").get();
        const v = Number(cfg.data()?.claimWindowHours);
        if (Number.isFinite(v) && v > 0) windowHours = v;
      } catch { /* default */ }

      const deliveredMs = toMillis(order.deliveredAt) ?? lastMovementMillis(order);
      if (deliveredMs && now - deliveredMs > windowHours * 3600_000) {
        return NextResponse.json(
          { error: `El plazo para reclamar venció (${windowHours}h desde la entrega). Escribinos por el chat del pedido.` },
          { status: 400 },
        );
      }
    } else {
      // 'stuck_order': pedido pagado que no avanza. No cambia el estado ni cancela nada --
      // escala a la bandeja del admin, igual que el report-problem del repartidor.
      if (order.paymentStatus !== "paid") {
        return NextResponse.json({ error: "Este reclamo es para pedidos ya pagados." }, { status: 400 });
      }
      if (!STUCK_CLAIMABLE_STATUSES.includes(order.status)) {
        return NextResponse.json({ error: "Este pedido no está en un estado demorable." }, { status: 400 });
      }
      const idleMs = now - lastMovementMillis(order);
      if (idleMs < STUCK_CLAIM_MIN_HOURS * 3600_000) {
        return NextResponse.json(
          { error: "Tu pedido todavía está dentro de los tiempos normales. Si en un rato no avanza, volvé a intentar." },
          { status: 400 },
        );
      }
    }

    // Ítems afectados: siempre un subconjunto de los ítems reales del pedido, releídos
    // del documento -- el body solo manda ids. El monto sugerido sale de acá.
    let claimItems: { id: string; name: string; quantity: number; price: number }[] = [];
    let suggestedAmount: number | null = null;

    if (meta.itemBased) {
      const ids: string[] = Array.isArray(itemIds) ? itemIds.map(String) : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: "Marcá qué productos tuvieron el problema." }, { status: 400 });
      }
      const orderItems: any[] = Array.isArray(order.items) ? order.items : [];
      claimItems = orderItems
        .filter((it) => ids.includes(String(it.id)))
        .map((it) => ({
          id: String(it.id),
          name: String(it.name || ""),
          quantity: Number(it.quantity) || 1,
          price: Number(it.price) || 0,
        }));
      if (claimItems.length === 0) {
        return NextResponse.json({ error: "Los productos marcados no pertenecen a este pedido." }, { status: 400 });
      }
      suggestedAmount = claimItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    } else if (type === "not_received" || type === "stuck_order") {
      suggestedAmount = Number(order.total) || null;
    }

    // Antifraude: contadores denormalizados en el propio reclamo. A escala Tinogasta no
    // se bloquea nada automáticamente -- el admin decide con el dato a la vista
    // ("3er reclamo, 2 reembolsados").
    let previousClaims = 0;
    let previousRefunded = 0;
    try {
      const [allSnap, refundedSnap] = await Promise.all([
        adminDb.collection("claims").where("userId", "==", callerUid).count().get(),
        adminDb.collection("claims").where("userId", "==", callerUid).where("resolution", "==", "refunded").count().get(),
      ]);
      previousClaims = allSnap.data().count;
      previousRefunded = refundedSnap.data().count;
    } catch (e) {
      Sentry.captureException(e, { tags: { area: "claims-create" }, extra: { step: "fraud-counters" } });
    }

    // Crear el reclamo y marcar el pedido en la MISMA transacción: el chequeo de
    // "un reclamo por pedido" no sirve si dos requests simultáneas pasan el get de arriba.
    const claimRef = adminDb.collection("claims").doc();
    await adminDb.runTransaction(async (tx) => {
      const fresh = await tx.get(orderRef);
      if (fresh.data()?.claimId) throw new Error("Este pedido ya tiene un reclamo abierto.");
      tx.create(claimRef, {
        orderId,
        userId: callerUid,
        userName: order.customerName || "",
        storeId: order.storeId || null,
        storeName: order.storeName || null,
        type,
        description: descriptionText,
        items: claimItems,
        photoPath: photo || null,
        suggestedAmount,
        orderTotal: Number(order.total) || 0,
        previousClaims,
        previousRefunded,
        resolved: false,
        createdAt: Timestamp.now(),
      });
      tx.update(orderRef, { hasClaim: true, claimId: claimRef.id });
    });

    // Confirmación al comprador (campanita + push). El admin lo ve en su bandeja de
    // atención del dashboard -- mismo criterio que payment_mismatches, sin notificación
    // individual.
    await notifyUser({
      userId: callerUid,
      title: "📋 Recibimos tu reclamo",
      body: "Vamos a revisarlo y te avisamos por acá qué resolvimos.",
      type: "order_status",
      orderId,
    });

    return NextResponse.json({ success: true, claimId: claimRef.id });
  } catch (error: any) {
    if (String(error?.message || "").includes("ya tiene un reclamo")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("❌ Error creando reclamo:", error);
    Sentry.captureException(error, { tags: { area: "claims-create" } });
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
