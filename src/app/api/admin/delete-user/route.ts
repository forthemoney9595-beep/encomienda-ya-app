import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyFullAdmin } from "@/lib/auth-server";
import { logAdminActionServer } from "@/lib/admin-audit-server";
import { computeStoreBalance, computeDriverBalance } from "@/lib/payout-service";

// Elimina un usuario de Firebase Auth Y de Firestore en una sola operación.
// El deleteDoc directo desde el cliente (admin/users/page.tsx) solo borraba de Firestore
// y dejaba la cuenta de Auth activa -- el usuario podía seguir logueándose.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'admin:delete-user', 10, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Borrado permanente de cuenta -- exige admin de nivel 'full', no alcanza con 'support'.
  if (!(await verifyFullAdmin(callerUid))) {
    return NextResponse.json({ error: "No autorizado — se requiere admin con acceso completo" }, { status: 403 });
  }

  try {
    const { userId, force } = await request.json();
    if (!userId) return NextResponse.json({ error: "Falta userId" }, { status: 400 });
    if (userId === callerUid) return NextResponse.json({ error: "No podés eliminarte a vos mismo" }, { status: 400 });

    const userSnap = await adminDb.collection('users').doc(userId).get();
    const u = userSnap.data() || {};
    const label = u.displayName || u.email || userId;

    // 🚨 Borrar una cuenta con plata pendiente hace desaparecer una deuda real: el saldo se
    // calcula desde los pedidos, pero sin el doc de usuario/tienda nadie vuelve a verlo, y
    // el retiro pendiente queda huérfano en `withdrawals`. Se bloquea salvo `force`
    // explícito, y en ese caso queda registrado el monto que se estaba debiendo.
    let owed = 0;
    try {
      if (u.role === 'delivery') {
        const b = await computeDriverBalance(userId);
        owed = b.availableBalance + b.withdrawnPending;
      } else if (u.role === 'store') {
        const storesSnap = await adminDb.collection('stores').where('ownerId', '==', userId).limit(1).get();
        if (!storesSnap.empty) {
          const b = await computeStoreBalance(storesSnap.docs[0].id);
          owed = b.availableBalance + b.withdrawnPending;
        }
      }
    } catch (balanceErr) {
      // Tanda B: si el cálculo de saldo falla, la guarda de "tiene plata sin cobrar" se
      // desactiva en silencio y se puede borrar una cuenta con deuda — que al menos quede
      // reportado para revisarlo.
      console.error('⚠️ No se pudo calcular el saldo antes de borrar:', balanceErr);
      Sentry.captureException(balanceErr, { tags: { route: 'admin/delete-user', stage: 'balance-check' } });
    }

    if (owed > 1 && !force) {
      return NextResponse.json({
        error: `${label} tiene $${Math.round(owed).toLocaleString('es-AR')} sin cobrar. Pagale (o rechazá su solicitud) antes de borrar la cuenta.`,
        owed: Math.round(owed),
        needsForce: true,
      }, { status: 409 });
    }

    // Borrar de Firebase Auth (la cuenta real)
    await adminAuth.deleteUser(userId).catch(() => {
      // Si la cuenta no existe en Auth (ej. creada solo en Firestore), ignorar el error
    });

    // Borrar de Firestore
    await adminDb.collection('users').doc(userId).delete();

    // Si era admin, limpiar también roles_admin
    await adminDb.collection('roles_admin').doc(userId).delete().catch(() => {});

    // Liberar sus identificadores únicos (DNI/CUIT, Fase PP): si no, la persona no podría
    // volver a registrarse nunca — el doc de `unique_ids` quedaría reservado para siempre.
    try {
      const uniques = await adminDb.collection('unique_ids').where('uid', '==', userId).get();
      for (const d of uniques.docs) await d.ref.delete();
    } catch { /* no bloquear el borrado por esto */ }

    await logAdminActionServer(
      callerUid, 'delete_user', userId,
      `${label} (${u.role || 'sin rol'})${owed > 1 ? ` · se le debía $${Math.round(owed).toLocaleString('es-AR')}` : ''}`,
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error eliminando usuario:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
