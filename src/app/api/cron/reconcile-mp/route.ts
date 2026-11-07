import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { runReconciliation } from "@/lib/reconcile-mp";
import { updateMonthlyStats, updateDailyStats } from "@/lib/platform-stats";
import { sweepUnconfirmedOrders } from "@/lib/confirm-timeout-server";
import { sweepExpiredSuspensions } from "@/lib/suspension-server";

// Cron diario de Vercel (ver vercel.json) — misma protección CRON_SECRET que
// generate-settlements. Corre la conciliación con MercadoPago: re-verifica los pagos de
// las órdenes pagadas recientes y busca pagos aprobados en MP que no tengan su orden
// marcada (webhook perdido). Detalle en src/lib/reconcile-mp.ts.
export const maxDuration = 60; // consulta la API de MP pago por pago

export async function GET(request: Request) {
  // 🔒 FAIL-CLOSED (Tanda A): sin CRON_SECRET configurado, nadie pasa — antes la guarda
  // entera se salteaba si faltaba la env var.
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const summary = await runReconciliation("cron");
    // Cierres mensuales (Fase OO ter): se mantienen desde este mismo cron porque Vercel
    // Hobby no permite un tercero. Corre DESPUÉS de conciliar: los cierres se calculan
    // sobre datos ya verificados contra MP. No lanza (updateMonthlyStats traga y reporta).
    const { updated } = await updateMonthlyStats();
    // Cierres diarios (Tanda T2): mismo criterio y mismo cron; alimentan /admin/finances.
    const daily = await updateDailyStats();
    // Red de seguridad de la cancelación automática (Fase YY): los 'Pendiente de
    // Confirmación' vencidos que ningún cliente estaba mirando. El reloj fino lo dan los
    // clientes (ver /api/orders/confirm-timeout); con Vercel Pro un cron por minuto lo
    // reemplaza. Aislado en su try: un fallo acá no debe tumbar la conciliación.
    let unconfirmed = { checked: 0, cancelled: 0, errors: 0 };
    try {
      unconfirmed = await sweepUnconfirmedOrders();
    } catch (e) {
      console.error("❌ [Cron] barrido de pedidos sin confirmar:", e);
      Sentry.captureException(e, { tags: { route: "cron/reconcile-mp", step: "confirm-timeout-sweep" } });
    }
    console.log(`[Cron] reconcile-mp: ${JSON.stringify(summary)} · meses actualizados: ${updated.join(", ") || "ninguno"} · días: ${daily.updated.length}/${daily.checked} · sin confirmar cancelados: ${unconfirmed.cancelled}/${unconfirmed.checked}`);
    // Fin de suspensiones temporales vencidas (Fase YY ter): el reloj fino lo da el aviso del
    // dueño (/api/account/suspension-check); esto levanta las que nadie disparó. Aislado.
    let suspensions = { checked: 0, lifted: 0, errors: 0 };
    try {
      suspensions = await sweepExpiredSuspensions();
    } catch (e) {
      Sentry.captureException(e, { tags: { route: "cron/reconcile-mp", step: "suspension-sweep" } });
    }
    return NextResponse.json({ status: "ok", ...summary, monthsUpdated: updated, daysUpdated: daily.updated.length, daysChecked: daily.checked, unconfirmedCancelled: unconfirmed.cancelled, unconfirmedChecked: unconfirmed.checked, suspensionsLifted: suspensions.lifted, suspensionsChecked: suspensions.checked });
  } catch (error: any) {
    console.error("❌ [Cron] Error en reconcile-mp:", error);
    Sentry.captureException(error, { tags: { route: "cron/reconcile-mp" } });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
