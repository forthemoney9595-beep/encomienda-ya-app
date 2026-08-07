import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyFullAdmin } from "@/lib/auth-server";
import { runReconciliation } from "@/lib/reconcile-mp";
import { updateMonthlyStats } from "@/lib/platform-stats";

// Botón "Conciliar ahora" de /admin/payment-issues. Exige admin 'full': la conciliación
// puede marcar órdenes como pagadas (webhook perdido) — es un cambio de estado de plata,
// mismo criterio que aprobar retiros o reembolsar.
export const maxDuration = 60;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  // Corridas caras (consultan la API de MP pago por pago): pocas por ventana.
  const { allowed } = checkRateLimit(ip, "admin:reconcile-mp", 3, 5 * 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "La conciliación ya corrió hace poco. Esperá unos minutos." }, { status: 429 });
  }

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await verifyFullAdmin(callerUid))) {
    return NextResponse.json({ error: "No autorizado — se requiere admin con acceso completo" }, { status: 403 });
  }

  try {
    const summary = await runReconciliation("manual", callerUid);
    // Mismo criterio que el cron: los cierres mensuales se refrescan tras conciliar.
    const { updated } = await updateMonthlyStats();
    return NextResponse.json({ status: "ok", ...summary, monthsUpdated: updated });
  } catch (error: any) {
    console.error("❌ Error en conciliación manual:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
