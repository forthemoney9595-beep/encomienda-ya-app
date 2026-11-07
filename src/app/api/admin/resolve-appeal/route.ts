import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthTokenStrict, verifyAdmin } from "@/lib/auth-server";
import { validateAppealDecision } from "@/lib/suspension";
import { resolveAppeal, suspensionErrorResponse } from "@/lib/suspension-server";

// Resolver una apelación (Fase YY ter, Tanda C): REACTIVAR (levanta la suspensión por el mismo
// camino transaccional que cualquier levantamiento) o MANTENER con respuesta escrita
// obligatoria. En los dos casos la persona recibe la respuesta y queda auditado server-side.
// Cualquier nivel de admin, mismo criterio que suspender.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "admin:resolve-appeal", 30, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes. Esperá un minuto." }, { status: 429 });

  const callerUid = await verifyAuthTokenStrict(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await verifyAdmin(callerUid))) return NextResponse.json({ error: "Solo un administrador puede resolver apelaciones." }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Pedido inválido" }, { status: 400 }); }
  const appealId = typeof body?.appealId === "string" ? body.appealId.trim() : "";
  if (!appealId) return NextResponse.json({ error: "Falta la apelación." }, { status: 400 });
  const invalid = validateAppealDecision(body?.decision, body?.response);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  try {
    const r = await resolveAppeal({ appealId, decision: body.decision, response: String(body.response || ""), adminUid: callerUid });
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    const known = suspensionErrorResponse(e);
    if (known) return NextResponse.json({ error: known.error }, { status: known.status });
    console.error("❌ resolve-appeal:", e);
    Sentry.captureException(e, { tags: { route: "admin/resolve-appeal" } });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
