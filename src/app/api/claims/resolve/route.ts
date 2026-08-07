import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyAdmin } from "@/lib/auth-server";
import { logAdminActionServer } from "@/lib/admin-audit-server";
import { notifyUser } from "@/lib/notify-server";
import * as Sentry from "@sentry/nextjs";

// Resuelve un reclamo SIN mover plata: rechazarlo con motivo, o marcarlo resuelto por
// otra vía (arreglado por chat, la tienda repuso el producto, etc.). La tercera salida
// -- reembolsar -- va por /api/admin/refund-order con claimId, que exige admin 'full';
// estas dos son trabajo operativo y alcanza con cualquier nivel de admin (mismo criterio
// que resolver un payment_mismatch).
//
// La nota es obligatoria en ambas: "resuelto" sin decir qué se hizo no sirve dentro de
// seis meses, y en el rechazo la nota es lo que le llega al comprador como explicación.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "claims:resolve", 20, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await verifyAdmin(callerUid))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { claimId, action, note } = await request.json();
    if (!claimId) return NextResponse.json({ error: "Falta claimId" }, { status: 400 });
    if (action !== "reject" && action !== "other") {
      return NextResponse.json({ error: "Acción inválida (reject | other)" }, { status: 400 });
    }

    const noteText = String(note || "").trim().slice(0, 500);
    if (noteText.length < 4) {
      return NextResponse.json(
        { error: action === "reject"
          ? "Explicá el motivo del rechazo — es lo que va a leer el comprador."
          : "Anotá cómo se resolvió el reclamo." },
        { status: 400 },
      );
    }

    const claimRef = adminDb.collection("claims").doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) return NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });
    const claim = claimSnap.data()!;

    if (claim.resolved === true) {
      return NextResponse.json({ error: "Este reclamo ya fue resuelto." }, { status: 400 });
    }

    await claimRef.update({
      resolved: true,
      resolution: action === "reject" ? "rejected" : "other",
      resolutionNote: noteText,
      resolvedAt: Timestamp.now(),
      resolvedBy: callerUid,
    });

    // El comprador recibe la explicación, no un silencio.
    await notifyUser({
      userId: claim.userId,
      title: action === "reject" ? "📋 Revisamos tu reclamo" : "✅ Tu reclamo fue resuelto",
      body: action === "reject"
        ? `No pudimos aprobarlo esta vez: ${noteText}`
        : noteText,
      type: "order_status",
      orderId: claim.orderId,
    });

    await logAdminActionServer(
      callerUid,
      "resolve_claim",
      claimId,
      `${action === "reject" ? "rechazado" : "otra vía"} — ${noteText}`,
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error resolviendo reclamo:", error);
    Sentry.captureException(error, { tags: { area: "claims-resolve" } });
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
