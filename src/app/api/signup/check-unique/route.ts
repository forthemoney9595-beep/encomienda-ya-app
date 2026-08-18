import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Pre-chequeo de DNI/CUIT/teléfono del registro (auditoría de privacidad, ago 2026).
// Antes el cliente hacía `get` directo sobre `unique_ids/{tipo_valor}` — pero ese doc
// contiene el UID asociado: cualquier logueado que conociera un DNI/CUIT/tel ajeno
// obtenía a qué cuenta pertenece. Ahora la regla cierra el `get` al cliente y este
// endpoint responde SOLO un booleano. Sin auth a propósito: corre antes de crear la
// cuenta. La garantía real de unicidad sigue siendo el create del batch contra las
// reglas (crear sobre un doc existente = denegado), esto es solo el error amable.
const VALID_TYPES = new Set(["dni", "cuit", "tel"]);

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "signup:check-unique", 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const type = String(body.type || "");
    const digits = String(body.value || "").replace(/\D/g, "");

    if (!VALID_TYPES.has(type) || digits.length < 6 || digits.length > 15) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const snap = await adminDb.collection("unique_ids").doc(`${type}_${digits}`).get();
    return NextResponse.json({ taken: snap.exists });
  } catch (error) {
    console.error("❌ Error en check-unique:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
