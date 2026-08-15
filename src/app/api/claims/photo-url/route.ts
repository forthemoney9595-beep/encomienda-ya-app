import { NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { verifyAuthToken, verifyAdmin } from "@/lib/auth-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// URL firmada de corta duración para la foto de evidencia de un reclamo. Mismo criterio
// que /api/licenses/signed-url: la evidencia de una disputa no es pública -- nunca se
// guarda una URL con token permanente, y el path a firmar SIEMPRE se lee del propio doc
// del reclamo (nunca del body: sería un oráculo de firmado de cualquier archivo del bucket).
// Solo el comprador dueño del reclamo o un admin pueden pedirla.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, "claims:photo-url", 30, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Tanda B: body malformado tiraba una excepción sin manejar (500 crudo del framework).
  const { claimId } = await request.json().catch(() => ({}));
  if (!claimId) return NextResponse.json({ error: "Falta claimId" }, { status: 400 });

  const claimSnap = await adminDb.collection("claims").doc(claimId).get();
  if (!claimSnap.exists) return NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });
  const claim = claimSnap.data()!;

  if (claim.userId !== callerUid && !(await verifyAdmin(callerUid))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!claim.photoPath) return NextResponse.json({ url: null });

  try {
    const bucket = adminStorage.bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    const [signedUrl] = await bucket.file(claim.photoPath).getSignedUrl({
      action: "read",
      expires: Date.now() + 5 * 60 * 1000, // 5 minutos
    });
    return NextResponse.json({ url: signedUrl });
  } catch (err) {
    console.error(`Error firmando evidencia del reclamo ${claimId}:`, err);
    return NextResponse.json({ url: null });
  }
}
