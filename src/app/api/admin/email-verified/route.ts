import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyAdmin } from "@/lib/auth-server";

// ¿Qué cuentas tienen el MAIL VERIFICADO? (decisión de David, 18/8: la verificación de
// mail es requisito para aprobar tiendas/repartidores — este endpoint alimenta el badge
// de la cola de aprobaciones). El dato vive en Firebase AUTH, que el cliente no puede
// leer de otros usuarios; por eso va por Admin SDK, solo para admins.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "admin:email-verified", 30, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // Nivel admin normal alcanza: es información operativa para aprobar, no mueve plata.
  if (!(await verifyAdmin(callerUid))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const uids: string[] = Array.isArray(body.uids)
      ? body.uids.filter((u: unknown) => typeof u === "string" && u.length > 0).slice(0, 100)
      : [];
    if (uids.length === 0) return NextResponse.json({ verified: {} });

    const result = await adminAuth.getUsers(uids.map((uid) => ({ uid })));
    const verified: Record<string, boolean> = {};
    for (const u of result.users) verified[u.uid] = u.emailVerified === true;
    // Cuentas no encontradas en Auth (borradas a medias): false explícito.
    for (const nf of result.notFound) {
      const id = (nf as { uid?: string }).uid;
      if (id) verified[id] = false;
    }
    return NextResponse.json({ verified });
  } catch (error) {
    console.error("❌ Error en email-verified:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
