import { NextResponse } from "next/server";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyAuthToken, verifyFullAdmin } from "@/lib/auth-server";
import { pushTag } from "@/lib/notify-server";

// Envío de notificaciones desde el panel de admin.
// Destinos: 'all' | 'stores' | 'drivers' | 'user:{uid}'
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'admin:notify-broadcast', 5, 3_600_000); // 5 por hora
  if (!allowed) return NextResponse.json({ error: "Límite de envíos alcanzado (5 por hora)." }, { status: 429 });

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Manda mensajes masivos -- exige admin de nivel 'full', no alcanza con 'support'.
  if (!(await verifyFullAdmin(callerUid))) {
    return NextResponse.json({ error: "No autorizado — se requiere admin con acceso completo" }, { status: 403 });
  }

  try {
    const { target, title, body } = await request.json();
    if (!target || !title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: "Faltan campos: target, title, body" }, { status: 400 });
    }
    if (title.length > 60) return NextResponse.json({ error: "Título máximo 60 caracteres" }, { status: 400 });
    if (body.length > 160) return NextResponse.json({ error: "Cuerpo máximo 160 caracteres" }, { status: 400 });

    let recipientUids: string[] = [];

    if (target === 'all') {
      const snap = await adminDb.collection('users').get();
      recipientUids = snap.docs.map(d => d.id);
    } else if (target === 'stores') {
      const snap = await adminDb.collection('users').where('role', '==', 'store').get();
      recipientUids = snap.docs.map(d => d.id);
    } else if (target === 'drivers') {
      const snap = await adminDb.collection('users').where('role', '==', 'delivery').get();
      recipientUids = snap.docs.map(d => d.id);
    } else if (target.startsWith('user:')) {
      recipientUids = [target.replace('user:', '')];
    } else {
      return NextResponse.json({ error: "Destino inválido" }, { status: 400 });
    }

    if (recipientUids.length === 0) {
      return NextResponse.json({ sent: 0, notified: 0 });
    }

    // Crear notificación in-app para cada destinatario (la campanita)
    const batch = adminDb.batch();
    for (const uid of recipientUids) {
      const ref = adminDb.collection('notifications').doc();
      batch.set(ref, {
        userId: uid,
        title,
        body,
        type: 'admin_broadcast',
        // Un anuncio no tiene destino natural; con link '/' al menos tocar la campanita
        // hace algo (antes era un botón muerto — Fase PP).
        link: '/',
        read: false,
        createdAt: Timestamp.now(),
      });
    }
    await batch.commit();

    // Enviar push FCM a todos los tokens de los destinatarios
    const usersSnap = await adminDb.getAll(
      ...recipientUids.map(uid => adminDb.collection('users').doc(uid))
    );
    const tokens: string[] = [];
    usersSnap.forEach(d => {
      const data = d.data();
      if (data?.fcmToken) tokens.push(data.fcmToken);
      if (Array.isArray(data?.fcmTokens)) tokens.push(...data.fcmTokens);
    });
    const uniqueTokens = [...new Set(tokens)];

    let pushSent = 0;
    // Un tag por ENVÍO: si un aparato tiene dos tokens vivos, ve UNA notificación de este
    // broadcast; broadcasts distintos no se pisan entre sí.
    const broadcastTag = pushTag('broadcast', String(Date.now()));
    if (uniqueTokens.length > 0) {
      // sendEachForMulticast admite max 500 tokens por llamada
      for (let i = 0; i < uniqueTokens.length; i += 500) {
        const chunk = uniqueTokens.slice(i, i + 500);
        const result = await adminMessaging.sendEachForMulticast({
          tokens: chunk,
          notification: { title, body },
          webpush: { fcmOptions: { link: '/' }, notification: { tag: broadcastTag } },
          data: { url: '/' },
        }).catch(() => ({ successCount: 0 }));
        pushSent += result.successCount;
      }
    }

    // Historial de comunicaciones (Fase GG): antes NO quedaba registro de qué se mandó,
    // a quién ni cuándo -- no se podía auditar ni reenviar un mensaje anterior. Se escribe
    // desde acá (Admin SDK) para que el cliente no pueda fabricar entradas falsas.
    await adminDb.collection('broadcasts').add({
      adminUid: callerUid,
      target,
      title,
      body,
      notified: recipientUids.length,
      pushSent,
      createdAt: Timestamp.now(),
    }).catch(err => console.error('[Admin broadcast] no se pudo guardar el historial:', err));

    console.log(`[Admin broadcast] ${callerUid} → ${target}: ${recipientUids.length} notificaciones, ${pushSent} push`);
    return NextResponse.json({ sent: pushSent, notified: recipientUids.length });

  } catch (error: any) {
    console.error("❌ Error en notify-broadcast:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
