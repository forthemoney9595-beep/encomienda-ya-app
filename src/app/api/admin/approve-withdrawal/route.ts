import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyFullAdmin } from "@/lib/auth-server";
import { computeStoreBalance, computeDriverBalance } from "@/lib/payout-service";
import { logAdminActionServer } from "@/lib/admin-audit-server";

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

  // Mueve plata real -- exige admin de nivel 'full', no alcanza con 'support'.
  if (!(await verifyFullAdmin(callerUid))) {
    return NextResponse.json({ error: "No autorizado — se requiere admin con acceso completo" }, { status: 403 });
  }

  try {
    const { withdrawalId, operationRef, note } = await request.json();
    if (!withdrawalId) {
      return NextResponse.json({ error: "Falta withdrawalId" }, { status: 400 });
    }
    // El comprobante de la transferencia es obligatorio: la plata se transfiere POR FUERA
    // (banco/MercadoPago) y sin este dato no hay forma de rastrear un pago si mañana la
    // tienda dice "no me llegó". Antes solo se marcaba `approved` sin ninguna referencia.
    const opRef = String(operationRef || '').trim();
    if (opRef.length < 4) {
      return NextResponse.json(
        { error: "Falta el número de operación / comprobante de la transferencia." },
        { status: 400 },
      );
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

    // Recalcular el saldo real para validar que el monto pedido es legítimo.
    //
    // 🚨 Se valida contra `approvableBalance` (facturado − retiros YA APROBADOS), NO contra
    // `availableBalance` (que además descuenta los pendientes). El retiro que estamos
    // aprobando está justamente en `pending`, así que usando `availableBalance` se restaba a
    // sí mismo: un retiro por el saldo completo daba siempre "supera el saldo disponible
    // ($0)" y ninguna liquidación del cron era aprobable.
    let approvableBalance = 0;
    if (w.userRole === 'store') {
      // Encontrar la tienda del dueño
      const storesSnap = await adminDb.collection('stores').where('ownerId', '==', w.userId).limit(1).get();
      if (!storesSnap.empty) {
        const result = await computeStoreBalance(storesSnap.docs[0].id);
        approvableBalance = result.approvableBalance;
      }
    } else if (w.userRole === 'delivery') {
      const result = await computeDriverBalance(w.userId);
      approvableBalance = result.approvableBalance;
    }

    const requestedAmount = Number(w.amount) || 0;
    if (requestedAmount > approvableBalance + 1) {
      // Tolerancia de $1 para redondeos -- si el monto pedido supera el saldo real, se rechaza
      return NextResponse.json({
        error: `El monto solicitado ($${requestedAmount.toLocaleString()}) supera el saldo real disponible ($${approvableBalance.toFixed(0)}). Revisá el saldo antes de aprobar.`,
        saldoReal: approvableBalance,
        montoSolicitado: requestedAmount,
      }, { status: 400 });
    }

    // Trazabilidad del pago: quién lo aprobó, cuándo, con qué comprobante y cuál era el
    // saldo real en ese momento. Antes solo quedaba `status` y la fecha, así que no había
    // forma de saber qué admin autorizó una transferencia ni de rastrearla en el banco.
    await withdrawalRef.update({
      status: 'approved',
      processedAt: Timestamp.now(),
      approvedBy: callerUid,
      operationRef: opRef,
      ...(note ? { adminNote: String(note).trim().slice(0, 300) } : {}),
      balanceAtApproval: Math.round(approvableBalance),
    });

    // Auditoría en la MISMA request que mueve la plata. Antes la escribía el cliente después
    // de recibir el OK: si el navegador se cerraba o fallaba justo ahí, el pago quedaba
    // aprobado sin ningún rastro de quién lo autorizó.
    await logAdminActionServer(
      callerUid, 'approve_withdrawal', withdrawalId,
      `$${requestedAmount.toLocaleString('es-AR')} a ${w.userName || w.userId} (${w.userRole === 'store' ? 'tienda' : 'repartidor'}) · op ${opRef}`,
    );

    return NextResponse.json({ success: true, amountApproved: requestedAmount });
  } catch (error: any) {
    console.error("❌ Error aprobando retiro:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
