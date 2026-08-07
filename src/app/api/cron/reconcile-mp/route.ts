import { NextResponse } from "next/server";
import { runReconciliation } from "@/lib/reconcile-mp";

// Cron diario de Vercel (ver vercel.json) — misma protección CRON_SECRET que
// generate-settlements. Corre la conciliación con MercadoPago: re-verifica los pagos de
// las órdenes pagadas recientes y busca pagos aprobados en MP que no tengan su orden
// marcada (webhook perdido). Detalle en src/lib/reconcile-mp.ts.
export const maxDuration = 60; // consulta la API de MP pago por pago

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const summary = await runReconciliation("cron");
    console.log(`[Cron] reconcile-mp: ${JSON.stringify(summary)}`);
    return NextResponse.json({ status: "ok", ...summary });
  } catch (error: any) {
    console.error("❌ [Cron] Error en reconcile-mp:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
