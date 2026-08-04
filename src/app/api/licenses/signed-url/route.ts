import { NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { verifyAuthToken } from "@/lib/auth-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Genera URLs de acceso de corta duración (5 min) para ver la licencia de conducir de un
// repartidor. Reemplaza el patrón anterior de guardar una URL pública con token permanente
// en Firestore (licenseUrl/licenseBackUrl/licenseSelfieUrl): esa URL, una vez generada, servía
// el archivo para siempre a cualquiera que la tuviera -- sin login, sin pasar por las reglas
// de seguridad -- porque Firebase Storage resuelve el token de la URL antes que las Storage
// Rules. Para un documento de identidad (DNI/carnet) ese riesgo no es aceptable.
//
// Solo el propio repartidor o un admin pueden pedir esto, y siempre se lee el path guardado
// en Firestore -- nunca se acepta un path arbitrario del cliente, para no abrir un oráculo de
// firmado de cualquier archivo del bucket.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'licenses:signed-url', 30, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { uid } = await request.json();
  if (!uid) return NextResponse.json({ error: "Falta uid" }, { status: 400 });

  if (callerUid !== uid) {
    const adminDoc = await adminDb.collection('roles_admin').doc(callerUid).get();
    if (!adminDoc.exists) {
      return NextResponse.json({ error: "Se requiere ser el propio usuario o admin" }, { status: 403 });
    }
  }

  const userDoc = await adminDb.collection('users').doc(uid).get();
  if (!userDoc.exists) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  const data = userDoc.data()!;

  const bucket = adminStorage.bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const fields = ['licenseUrl', 'licenseBackUrl', 'licenseSelfieUrl'] as const;
  const result: Record<string, string | null> = {};

  await Promise.all(fields.map(async (field) => {
    const value: string | undefined = data[field];
    if (!value) { result[field] = null; return; }

    // Compat: datos viejos (de antes de este fix) ya tienen una URL completa con token
    // guardada -- se devuelve tal cual, no hay path que firmar. Los uploads nuevos guardan
    // solo el path (ver image-upload.tsx storeRawPath) y sí se firman acá.
    if (value.startsWith('http')) { result[field] = value; return; }

    try {
      const [signedUrl] = await bucket.file(value).getSignedUrl({
        action: 'read',
        expires: Date.now() + 5 * 60 * 1000, // 5 minutos
      });
      result[field] = signedUrl;
    } catch (err) {
      console.error(`Error firmando ${field} de ${uid}:`, err);
      result[field] = null;
    }
  }));

  return NextResponse.json(result);
}
