import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthTokenStrict, verifyAdmin } from "@/lib/auth-server";
import { validateSuspensionInput, type SuspensionReason } from "@/lib/suspension";
import { applySuspension, suspensionErrorResponse } from "@/lib/suspension-server";

// Suspender una cuenta de repartidor o de tienda CON debido proceso (Fase YY ter, Tanda C):
// motivo de lista cerrada + detalle que lee la persona + duración. Todo server-side en una
// transacción (src/lib/suspension-server.ts), con aviso por notifyUser y auditoría server-side.
//
// Nivel: cualquier admin (incluido 'support'). Es la misma familia que aprobar/rechazar
// cuentas, que 'support' ya hace (Fase PP-T4): trabajo operativo de confianza y seguridad
// que a veces es URGENTE (un repartidor que maltrata clientes un domingo a la noche), no
// mueve plata (lo ganado se le sigue debiendo) y queda auditado y avisado con motivo. La
// protección de la persona es el procedimiento (motivo escrito + apelación), no el nivel.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "admin:suspend-account", 20, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes. Esperá un minuto." }, { status: 429 });

  const callerUid = await verifyAuthTokenStrict(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await verifyAdmin(callerUid))) return NextResponse.json({ error: "Solo un administrador puede suspender cuentas." }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Pedido inválido" }, { status: 400 }); }
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!userId) return NextResponse.json({ error: "Falta la cuenta a suspender." }, { status: 400 });
  const durationDays = body?.durationDays ?? null;
  const invalid = validateSuspensionInput({ reason: body?.reason, detail: body?.detail, durationDays });
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  try {
    const r = await applySuspension({
      uid: userId, reason: body.reason as SuspensionReason, detail: String(body.detail), durationDays, adminUid: callerUid,
    });
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    const known = suspensionErrorResponse(e);
    if (known) return NextResponse.json({ error: known.error }, { status: known.status });
    console.error("❌ suspend-account:", e);
    Sentry.captureException(e, { tags: { route: "admin/suspend-account" } });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
