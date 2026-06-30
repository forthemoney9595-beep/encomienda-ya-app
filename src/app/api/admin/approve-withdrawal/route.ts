import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken } from "@/lib/auth-server";
import { computeStoreBalance, computeDriverBalance } from "@/lib/payout-service";

// Primera ruta admin-only de la API — verifica token + existencia en roles_admin.
// Antes, aprobar un retiro era un updateDoc directo desde el cliente (protegido solo
// por la regla isAdmin() de Firestore) que confiaba ciegamente en el monto guardado.
// Ahora recalcula el saldo real antes de aprobar.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'admin:approve-withdrawal', 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Verificar que es admin real (misma fuente de verdad que isAdmin() en firestore.rules)
  const adminDoc = await adminDb.collection('roles_admin').doc(callerUid).get();
  if (!adminDoc.exists) {
    return NextResponse.json({ error: "No autorizado — se requiere rol admin" }, { status: 403 });
  }

  try {
    const { withdrawalId } = await request.json();
    if (!withdrawalId) {
      return NextResponse.json({ error: "Falta withdrawalId" }, { status: 400 });
    }

    const withdrawalRef = adminDb.collection('withdrawals').doc(withdrawalId);
    const withdrawalSnap = await withdrawalRef.get();
    if (!withdrawalSnap.exists) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    const w = withdrawalSnap.data()!;
    if (w.status !== 'pending') {
      return NextResponse.json({ error: `Esta solicitud ya está "${w.status}", no se puede aprobar.` }, { status: 400 });
    }

    // Recalcular el saldo real para validar que el monto pedido es legítimo
    let availableBalance = 0;
    if (w.userRole === 'store') {
      // Encontrar la tienda del dueño
      const storesSnap = await adminDb.collection('stores').where('ownerId', '==', w.userId).limit(1).get();
      if (!storesSnap.empty) {
        const result = await computeStoreBalance(storesSnap.docs[0].id);
        availableBalance = result.availableBalance;
      }
    } else if (w.userRole === 'delivery') {
      const result = await computeDriverBalance(w.userId);
      availableBalance = result.availableBalance;
    }

    const requestedAmount = Number(w.amount) || 0;
    if (requestedAmount > availableBalance + 1) {
      // Tolerancia de $1 para redondeos -- si el monto pedido supera el saldo real, se rechaza
      return NextResponse.json({
        error: `El monto solicitado ($${requestedAmount.toLocaleString()}) supera el saldo real disponible ($${availableBalance.toFixed(0)}). Revisá el saldo antes de aprobar.`,
        saldoReal: availableBalance,
        montoSolicitado: requestedAmount,
      }, { status: 400 });
    }

    await withdrawalRef.update({
      status: 'approved',
      processedAt: Timestamp.now(),
    });

    return NextResponse.json({ success: true, amountApproved: requestedAmount });
  } catch (error: any) {
    console.error("❌ Error aprobando retiro:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
