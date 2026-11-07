import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthTokenStrict } from "@/lib/auth-server";
import { validateAppealText } from "@/lib/suspension";
import { createAppeal, suspensionErrorResponse } from "@/lib/suspension-server";

// Apelar una suspensión (Fase YY ter, Tanda C). Lo llama el DUEÑO de la cuenta: el uid sale
// del token, nunca del body. Una apelación por suspensión y ninguna si ya hay otra abierta —
// se valida dentro de la transacción que crea account_appeals/{id} (colección que el cliente
// no puede escribir: reglas en false).
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "account:appeal", 10, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes. Esperá un minuto." }, { status: 429 });

  const uid = await verifyAuthTokenStrict(request);
  if (!uid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Pedido inválido" }, { status: 400 }); }
  const invalid = validateAppealText(body?.text);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  try {
    const r = await createAppeal({ uid, text: String(body.text) });
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    const known = suspensionErrorResponse(e);
    if (known) return NextResponse.json({ error: known.error }, { status: known.status });
    console.error("❌ account/appeal:", e);
    Sentry.captureException(e, { tags: { route: "account/appeal" } });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
