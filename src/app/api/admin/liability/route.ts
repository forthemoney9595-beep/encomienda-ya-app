import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyAdmin } from "@/lib/auth-server";
import { computeStoreBalance, computeDriverBalance } from "@/lib/payout-service";

/**
 * Pasivo real de la plataforma: cuánta plata se le debe HOY a tiendas y repartidores.
 *
 * Por qué existe: la tarjeta "Total en sistema" de Finanzas sumaba
 * `pendiente + pagado + rechazado`, que no es ningún número real (mezcla plata que ya salió
 * con plata que nunca salió, y cuenta dos veces el mismo retiro a lo largo de su vida). Lo
 * que el admin necesita saber es **cuánto debe**, incluida la plata que todavía nadie
 * solicitó — eso no está en `withdrawals`, hay que calcularlo desde los pedidos entregados.
 *
 * Usa exactamente las mismas funciones que valida `/api/admin/approve-withdrawal`
 * (`computeStoreBalance`/`computeDriverBalance`), así que el número de esta pantalla y el
 * que el servidor autoriza al pagar NO pueden desincronizarse.
 *
 * ⚠️ COSTO: es O(tiendas + repartidores) consultas, y cada una escanea los pedidos
 * entregados de ese usuario. Con el marketplace de Tinogasta (~20 tiendas, ~6 repartidores)
 * son decenas de lecturas — aceptable **bajo demanda**. Por eso NO se calcula al abrir la
 * página: se dispara con un botón. Si algún día crece, la salida natural es un documento
 * `stats/liability` mantenido por el cron que ya existe.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'admin:liability', 10, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes. Esperá un minuto." }, { status: 429 });
  }

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Es una lectura: alcanza con ser admin (cualquier nivel). Aprobar el pago sí exige 'full'.
  if (!(await verifyAdmin(callerUid))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const [storesSnap, driversSnap] = await Promise.all([
      adminDb.collection('stores').get(),
      adminDb.collection('users').where('role', '==', 'delivery').get(),
    ]);

    // Fase OO quater: cada fila viaja con su desglose completo (ganado / ya pagado /
    // solicitado) — el número solo, sin la cuenta que lo produce, confundía en el panel.
    type Row = {
      id: string; name: string; role: 'store' | 'delivery';
      earned: number; paid: number;
      available: number; pending: number; debt: number;
    };
    const rows: Row[] = [];

    for (const d of storesSnap.docs) {
      const b = await computeStoreBalance(d.id);
      // Solo interesa quien tiene algo (saldo, pedido pendiente o deuda).
      if (b.availableBalance > 0 || b.withdrawnPending > 0 || b.debt > 0) {
        rows.push({
          id: d.id, name: d.data()?.name || 'Tienda sin nombre', role: 'store',
          earned: Math.round(b.totalRevenue), paid: Math.round(b.withdrawnSettled),
          available: b.availableBalance, pending: b.withdrawnPending, debt: b.debt,
        });
      }
    }

    for (const d of driversSnap.docs) {
      const b = await computeDriverBalance(d.id);
      if (b.availableBalance > 0 || b.withdrawnPending > 0 || b.debt > 0) {
        rows.push({
          id: d.id, name: d.data()?.displayName || d.data()?.email || 'Repartidor', role: 'delivery',
          earned: Math.round(b.totalEarned), paid: Math.round(b.withdrawnSettled),
          available: b.availableBalance, pending: b.withdrawnPending, debt: b.debt,
        });
      }
    }

    const sumBy = (r: Row[], k: 'available' | 'pending' | 'debt') =>
      Math.round(r.reduce((s, x) => s + x[k], 0));

    const stores = rows.filter(r => r.role === 'store');
    const drivers = rows.filter(r => r.role === 'delivery');

    return NextResponse.json({
      // `available` ya descuenta lo que está solicitado y sin pagar, así que el pasivo TOTAL
      // es available + pending (todo lo que falta transferir).
      storeLiability:  sumBy(stores, 'available')  + sumBy(stores, 'pending'),
      driverLiability: sumBy(drivers, 'available') + sumBy(drivers, 'pending'),
      totalPending:    sumBy(rows, 'pending'),
      totalDebt:       sumBy(rows, 'debt'),
      counts: { stores: stores.length, drivers: drivers.length },
      // TODAS las cuentas con deuda, ordenadas por lo que se les debe (el set es chico:
      // solo las que tienen algo). Antes era top 10 y el título decía "15 tiendas" pero
      // la lista mostraba 10 — otra fuente de confusión.
      top: rows
        .filter(r => r.available + r.pending > 0)
        .map(r => ({ ...r, owed: Math.round(r.available + r.pending) }))
        .sort((a, b) => b.owed - a.owed),
      // Quien quedó con saldo negativo (se le pagó de más, típicamente por un reembolso
      // posterior a la liquidación). Antes esto era invisible. Viaja con la cuenta
      // completa (cobró X, sus ventas justifican Y) para que el "debe" se explique solo.
      overpaid: rows.filter(r => r.debt > 0).map(r => ({
        id: r.id, name: r.name, role: r.role,
        earned: r.earned, paid: r.paid, debt: Math.round(r.debt),
      })),
      computedAt: Date.now(),
    });
  } catch (error: any) {
    console.error("❌ Error calculando pasivo:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
