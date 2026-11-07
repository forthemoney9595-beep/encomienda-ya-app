import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { adminDb } from "@/lib/firebase-admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken } from "@/lib/auth-server";
import { isSuspensionExpired, suspensionMillis } from "@/lib/suspension";
import { liftSuspension } from "@/lib/suspension-server";

// Fin de una suspensión temporal SIN cron por minuto (Vercel Hobby: 2 crons diarios, ya
// usados). El aviso de suspensión del dueño llama acá al montarse y cuando llega la hora de
// fin: si venció según el reloj del SERVIDOR, se levanta en ese momento (transacción + aviso +
// auditoría 'suspension_expired'). La red de seguridad es el barrido diario del cron de
// conciliación. El uid sale del token: cada uno solo dispara el chequeo de SU cuenta.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "account:suspension-check", 60, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });

  const uid = await verifyAuthToken(request);
  if (!uid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const s = (await adminDb.collection("users").doc(uid).get()).data()?.suspension;
    if (!s || s.active !== true) return NextResponse.json({ active: false, lifted: false });
    if (isSuspensionExpired(s, Date.now())) {
      const r = await liftSuspension({ uid, by: "system", cause: "expired" });
      return NextResponse.json({ active: false, lifted: r.lifted });
    }
    return NextResponse.json({ active: true, lifted: false, until: suspensionMillis(s.until) });
  } catch (e) {
    console.error("❌ suspension-check:", e);
    Sentry.captureException(e, { tags: { route: "account/suspension-check" } });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
