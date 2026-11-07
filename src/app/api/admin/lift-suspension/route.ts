import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthTokenStrict, verifyAdmin } from "@/lib/auth-server";
import { liftSuspension, suspensionErrorResponse } from "@/lib/suspension-server";

// Levantar una suspensión a mano, sin apelación de por medio (p. ej. la persona mandó la
// documentación que faltaba). "Activar" una cuenta suspendida desde el cliente habría ido por
// approval-service y dejado suspension.active en true; por eso el levantamiento es SIEMPRE
// server-side (las reglas ya no dejan al cliente tocar la aprobación de una cuenta
// suspendida). Mismo nivel que suspender (cualquier admin). Nota obligatoria: la persona la
// lee y queda en el log.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "admin:lift-suspension", 20, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes. Esperá un minuto." }, { status: 429 });

  const callerUid = await verifyAuthTokenStrict(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await verifyAdmin(callerUid))) return NextResponse.json({ error: "Solo un administrador puede levantar una suspensión." }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Pedido inválido" }, { status: 400 }); }
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!userId) return NextResponse.json({ error: "Falta la cuenta." }, { status: 400 });
  if (note.length < 10) {
    return NextResponse.json({ error: "Anotá por qué se levanta (al menos 10 caracteres): la persona lo lee y queda en el log." }, { status: 400 });
  }

  try {
    const r = await liftSuspension({ uid: userId, by: callerUid, cause: "admin", note });
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    const known = suspensionErrorResponse(e);
    if (known) return NextResponse.json({ error: known.error }, { status: known.status });
    console.error("❌ lift-suspension:", e);
    Sentry.captureException(e, { tags: { route: "admin/lift-suspension" } });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
