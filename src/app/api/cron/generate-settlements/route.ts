import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { adminDb } from "@/lib/firebase-admin";
import { notifyUser } from "@/lib/notify-server";
import { Timestamp } from "firebase-admin/firestore";
import { computeStoreBalance, computeDriverBalance } from "@/lib/payout-service";
import { nowInArgentina } from "@/lib/store-hours";

// Ruta para el cron job diario de Vercel.
// Vercel llama a esta URL automáticamente una vez por día (definido en vercel.json) y
// adjunta un header Authorization: Bearer $CRON_SECRET para evitar que cualquiera
// la llame. El cron revisa si hoy es el día de liquidación configurado y, si lo es,
// genera automáticamente las solicitudes de retiro para tiendas y repartidores que
// ya hayan ingresado su CBU alguna vez.
export async function GET(request: Request) {
  // 🔒 FAIL-CLOSED (Tanda A de la auditoría): antes era `if (secret && ...)` — si la
  // env var CRON_SECRET faltaba, la guarda entera se salteaba y la ruta quedaba PÚBLICA
  // (y esta crea solicitudes de retiro). Sin secret configurado, nadie pasa.
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    // El día se evalúa en hora ARGENTINA, no en UTC: Vercel corre en UTC y `getDay()` ahí
    // puede caer en otro día del que ve el usuario. Hoy el cron son las 14:00 UTC (11:00
    // ART, mismo día) así que no se notaba, pero bastaba mover el horario para que la
    // liquidación se generara el día equivocado. Mismo helper que usa el horario de tiendas.
    const now = nowInArgentina();
    const todayDow = now.getDay(); // 0=Dom, 5=Vie, etc.

    // Día de liquidación configurable desde Firestore (admin/dashboard)
    const configSnap = await adminDb.collection('config').doc('platform').get();
    const settlementDayOfWeek: number = configSnap.data()?.settlementDayOfWeek ?? 5; // Viernes por defecto

    if (todayDow !== settlementDayOfWeek) {
      return NextResponse.json({ status: "skipped", reason: `Hoy es día ${todayDow}, se liquida el día ${settlementDayOfWeek}` });
    }

    const results: { created: number; skipped: number; errors: number } = { created: 0, skipped: 0, errors: 0 };

    // --- TIENDAS ---
    const storesSnap = await adminDb.collection('stores').where('isApproved', '==', true).get();
    for (const storeDoc of storesSnap.docs) {
      const storeData = storeDoc.data();
      const ownerId = storeData.ownerId;
      if (!ownerId) { results.skipped++; continue; }
      // El CBU de la tienda ahora vive en el user doc del dueño (seguridad, ago 2026:
      // stores/{id} es de lectura pública). Fallback al viejo campo del store por si
      // queda algún doc sin migrar.
      const ownerDoc = await adminDb.collection('users').doc(ownerId).get();
      const payoutCbu = ownerDoc.data()?.payoutCbu || storeData.payoutCbu;
      if (!payoutCbu) { results.skipped++; continue; }

      // No generar si ya tiene una solicitud pendiente.
      // OJO `userRole`: sin ese filtro, una persona que sea dueña de tienda Y repartidor
      // (mismo uid) se bloqueaba a sí misma — un pago pendiente como tienda impedía
      // generar el de repartidor y viceversa. Los dos circuitos de pago son
      // independientes y no deben pisarse nunca.
      const existingPendingSnap = await adminDb.collection('withdrawals')
        .where('userId', '==', ownerId)
        .where('userRole', '==', 'store')
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      if (!existingPendingSnap.empty) { results.skipped++; continue; }

      try {
        const { availableBalance } = await computeStoreBalance(storeDoc.id);
        if (availableBalance < 1) { results.skipped++; continue; }

        const ref = await adminDb.collection('withdrawals').add({
          userId: ownerId,
          userName: storeData.name || 'Tienda',
          userRole: 'store',
          amount: Math.floor(availableBalance),
          cbu: payoutCbu,
          status: 'pending',
          source: 'auto',
          createdAt: Timestamp.now(),
        });

        // Notificar al dueño — via notifyUser (Fase PP): la campanita vieja no tenía
        // `link` y tocarla no llevaba a ningún lado.
        await notifyUser({
          userId: ownerId,
          title: "💰 Liquidación generada",
          body: `Tu liquidación de $${Math.floor(availableBalance).toLocaleString()} fue generada. El admin la procesará pronto.`,
          type: "payout",
          link: "/my-store/wallet",
        });

        results.created++;
      } catch (e) {
        console.error(`Error generando liquidación para tienda ${storeDoc.id}:`, e);
        results.errors++;
      }
    }

    // --- REPARTIDORES ---
    // OJO `isApproved` y NO `status`: son dos campos que ya se desincronizaron una vez
    // (ver Fase R1 — el admin aprobaba, la UI decía "Activo" pero el repartidor seguía
    // bloqueado). El gate real de "este repartidor opera" es isApproved, así que es el que
    // define quién cobra; usando `status` un repartidor aprobado con el status desfasado
    // se quedaba sin liquidación.
    const driversSnap = await adminDb.collection('users')
      .where('role', '==', 'delivery')
      .where('isApproved', '==', true)
      .get();

    for (const driverDoc of driversSnap.docs) {
      const driverData = driverDoc.data();
      const payoutCbu = driverData.payoutCbu;
      if (!payoutCbu) { results.skipped++; continue; }

      // Mismo criterio que arriba: acotado a userRole 'delivery' para no cruzarse con un
      // eventual pago pendiente del mismo uid como tienda.
      const existingPendingSnap = await adminDb.collection('withdrawals')
        .where('userId', '==', driverDoc.id)
        .where('userRole', '==', 'delivery')
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      if (!existingPendingSnap.empty) { results.skipped++; continue; }

      try {
        const { availableBalance } = await computeDriverBalance(driverDoc.id);
        if (availableBalance < 1) { results.skipped++; continue; }

        await adminDb.collection('withdrawals').add({
          userId: driverDoc.id,
          userName: driverData.displayName || driverData.name || 'Repartidor',
          userRole: 'delivery',
          amount: Math.floor(availableBalance),
          cbu: payoutCbu,
          status: 'pending',
          source: 'auto',
          createdAt: Timestamp.now(),
        });

        // Via notifyUser (Fase PP): la rama del repartidor ni siquiera mandaba push
        // (la de tiendas sí — asimetría pura) y su campanita no navegaba a ningún lado.
        await notifyUser({
          userId: driverDoc.id,
          title: "💰 Liquidación generada",
          body: `Tu liquidación de $${Math.floor(availableBalance).toLocaleString()} fue generada. El admin la procesará pronto.`,
          type: "payout",
          link: "/delivery/earnings",
        });

        results.created++;
      } catch (e) {
        console.error(`Error generando liquidación para repartidor ${driverDoc.id}:`, e);
        results.errors++;
      }
    }

    console.log(`[Cron] generate-settlements: ${JSON.stringify(results)}`);
    return NextResponse.json({ status: "ok", date: now.toISOString(), settlementDay: settlementDayOfWeek, results });

  } catch (error: any) {
    // Tanda B: un cron que falla en silencio = liquidaciones que no se generan y nadie
    // se entera hasta que alguien reclama su plata.
    console.error("❌ [Cron] Error en generate-settlements:", error);
    Sentry.captureException(error, { tags: { route: "cron/generate-settlements" } });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
