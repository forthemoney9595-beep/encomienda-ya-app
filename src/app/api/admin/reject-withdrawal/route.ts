import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyFullAdmin } from "@/lib/auth-server";
import { logAdminActionServer } from "@/lib/admin-audit-server";

/**
 * Rechazar una solicitud de retiro.
 *
 * Antes era un `updateDoc` directo desde `finance-view.tsx`: no guardaba **quién** rechazó,
 * y como el rechazo devuelve la plata al saldo disponible del usuario, era una operación de
 * dinero sin autor. Ahora va por API con token verificado, guarda `rejectedBy` y deja el
 * registro de auditoría en la misma request (igual que la aprobación).
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'admin:reject-withdrawal', 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Mismo nivel que aprobar: cambia el saldo disponible de un tercero.
  if (!(await verifyFullAdmin(callerUid))) {
    return NextResponse.json({ error: "No autorizado — se requiere admin con acceso completo" }, { status: 403 });
  }

  try {
    const { withdrawalId, reason } = await request.json();
    if (!withdrawalId) return NextResponse.json({ error: "Falta withdrawalId" }, { status: 400 });

    const ref = adminDb.collection('withdrawals').doc(withdrawalId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

    const w = snap.data()!;
    // Rechazar algo ya aprobado devolvería al saldo plata que YA se transfirió: el usuario
    // podría cobrarla dos veces. Solo se rechaza lo que sigue pendiente.
    if (w.status !== 'pending') {
      return NextResponse.json(
        { error: `Esta solicitud ya está "${w.status}", no se puede rechazar.` },
        { status: 400 },
      );
    }

    const rejectionReason = String(reason || '').trim().slice(0, 300);

    await ref.update({
      status: 'rejected',
      rejectionReason,
      rejectedBy: callerUid,
      processedAt: Timestamp.now(),
    });

    await logAdminActionServer(
      callerUid, 'reject_withdrawal', withdrawalId,
      `$${(Number(w.amount) || 0).toLocaleString('es-AR')} a ${w.userName || w.userId}${rejectionReason ? ` · ${rejectionReason}` : ''}`,
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error rechazando retiro:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
