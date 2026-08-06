import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken } from "@/lib/auth-server";
import { computeStoreBalance, computeDriverBalance } from "@/lib/payout-service";

/**
 * Solicitud de retiro (la pide la tienda desde /my-store/wallet o el repartidor desde
 * /delivery/earnings).
 *
 * Por qué existe: antes era un `addDoc` directo del cliente. La única validación del monto
 * estaba en el JavaScript de la billetera; la regla de Firestore solo podía comprobar
 * `amount > 0` (una regla no puede sumar los pedidos entregados de alguien). Es decir:
 * cualquiera podía crear desde la consola del navegador un retiro de $99.999.999.
 *
 * Eso no significaba cobrar de más — `/api/admin/approve-withdrawal` recalcula el saldo y
 * habría rechazado el pago — pero sí **congelaba la liquidación automática de esa cuenta**:
 * el cron saltea a quien ya tiene un retiro `pending`, así que un pedido basura dejaba a esa
 * tienda/repartidor sin cobrar hasta que un admin lo rechazara a mano.
 *
 * Ahora el monto se valida contra el saldo real calculado en el servidor, con la misma
 * función que usa la aprobación.
 */

const MIN_WITHDRAWAL = 1;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'withdrawals:request', 10, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes. Esperá un minuto." }, { status: 429 });
  }

  const uid = await verifyAuthToken(request);
  if (!uid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await request.json();
    const role: string = body.role;
    const amount = Number(body.amount);
    const cbu = String(body.cbu || '').trim();

    if (role !== 'store' && role !== 'delivery') {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
    }
    if (cbu.length < 5) {
      return NextResponse.json({ error: "CBU/alias inválido" }, { status: 400 });
    }

    // El rol se verifica contra Firestore, no contra lo que mande el cliente: si no, un
    // comprador podría pedir un retiro como si fuera repartidor.
    const userSnap = await adminDb.collection('users').doc(uid).get();
    if (!userSnap.exists) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    const u = userSnap.data()!;
    if (u.role !== role) {
      return NextResponse.json({ error: "Tu cuenta no tiene ese rol" }, { status: 403 });
    }

    let availableBalance = 0;
    let userName = u.displayName || u.email || 'Usuario';
    let storeId: string | null = null;

    if (role === 'store') {
      // El dueño real es `stores/{id}.ownerId` (mismo criterio que verifyStoreOwnership).
      const storesSnap = await adminDb.collection('stores').where('ownerId', '==', uid).limit(1).get();
      if (storesSnap.empty) {
        return NextResponse.json({ error: "No tenés ninguna tienda asociada" }, { status: 403 });
      }
      storeId = storesSnap.docs[0].id;
      userName = storesSnap.docs[0].data()?.name || userName;
      availableBalance = (await computeStoreBalance(storeId)).availableBalance;
    } else {
      availableBalance = (await computeDriverBalance(uid)).availableBalance;
    }

    // Tolerancia de $1 por redondeos entre el cálculo del cliente y el del servidor.
    if (amount > availableBalance + 1) {
      return NextResponse.json({
        error: `Tu saldo disponible es $${Math.round(availableBalance).toLocaleString('es-AR')}. Ya descuenta lo que tenés solicitado y sin cobrar.`,
        availableBalance: Math.round(availableBalance),
      }, { status: 400 });
    }

    const ref = await adminDb.collection('withdrawals').add({
      userId: uid,
      userName,
      userRole: role,
      amount: Math.round(amount),
      cbu,
      status: 'pending',
      source: 'manual',
      // Saldo real en el momento de pedirlo: sirve para entender después por qué se pidió
      // ese monto si el saldo cambió (un reembolso posterior, por ejemplo).
      balanceAtRequest: Math.round(availableBalance),
      createdAt: Timestamp.now(),
    });

    // Guardar el CBU para que la liquidación automática lo use (antes lo escribía el cliente).
    if (role === 'store' && storeId) {
      await adminDb.collection('stores').doc(storeId).update({ payoutCbu: cbu }).catch(() => {});
    } else if (role === 'delivery') {
      await adminDb.collection('users').doc(uid).update({ payoutCbu: cbu }).catch(() => {});
    }

    return NextResponse.json({ success: true, withdrawalId: ref.id, amount: Math.round(amount) });
  } catch (error: any) {
    console.error("❌ Error creando solicitud de retiro:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
