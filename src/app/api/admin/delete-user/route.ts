import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyFullAdmin } from "@/lib/auth-server";

// Elimina un usuario de Firebase Auth Y de Firestore en una sola operación.
// El deleteDoc directo desde el cliente (admin/users/page.tsx) solo borraba de Firestore
// y dejaba la cuenta de Auth activa -- el usuario podía seguir logueándose.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'admin:delete-user', 10, 60_000);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Borrado permanente de cuenta -- exige admin de nivel 'full', no alcanza con 'support'.
  if (!(await verifyFullAdmin(callerUid))) {
    return NextResponse.json({ error: "No autorizado — se requiere admin con acceso completo" }, { status: 403 });
  }

  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: "Falta userId" }, { status: 400 });
    if (userId === callerUid) return NextResponse.json({ error: "No podés eliminarte a vos mismo" }, { status: 400 });

    // Borrar de Firebase Auth (la cuenta real)
    await adminAuth.deleteUser(userId).catch(() => {
      // Si la cuenta no existe en Auth (ej. creada solo en Firestore), ignorar el error
    });

    // Borrar de Firestore
    await adminDb.collection('users').doc(userId).delete();

    // Si era admin, limpiar también roles_admin
    await adminDb.collection('roles_admin').doc(userId).delete().catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error eliminando usuario:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
