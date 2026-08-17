import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as Sentry from '@sentry/nextjs';

// Códigos de FCM que significan "este token está muerto, no va a volver" (dispositivo
// que desinstaló, suscripción vencida, basura). Los transitorios (quota, unavailable)
// NO van acá — esos tokens siguen siendo válidos.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * `tag` para la notificación web push: dos entregas con el MISMO tag se muestran como
 * UNA sola (la nueva reemplaza a la anterior). Es la red de seguridad contra el push
 * duplicado en un mismo aparato (p. ej. un dispositivo con un token viejo todavía vivo
 * recibía cada aviso dos veces — visto en la prueba del 15/8). Avisos DISTINTOS deben
 * llevar tags distintos (incluir el título) para no pisarse entre sí.
 */
export const pushTag = (...parts: (string | null | undefined)[]): string =>
  'eya-' + parts.filter(Boolean).join('-').replace(/[^\w-]+/g, '').slice(0, 60);

/**
 * Saca de `users/{uid}` los tokens que FCM reportó como muertos en un envío real.
 * Sin esto las cuentas acumulan tokens vencidos para siempre (en la gran prueba,
 * repartidor@test.com juntó 11 — cada push intentaba contra todos). Un mismo token
 * puede vivir en varias cuentas (mismo navegador logueado en varias), por eso el
 * mapa lleva token → [uids]. Nunca lanza: limpiar es mantenimiento, no puede abortar
 * el envío que ya salió.
 */
export async function pruneDeadFcmTokens(
  tokens: string[],
  responses: { success: boolean; error?: { code?: string } }[],
  tokenOwners: Map<string, string[]>,
): Promise<void> {
  try {
    const byUid = new Map<string, string[]>();
    responses.forEach((r, i) => {
      if (r.success) return;
      if (!DEAD_TOKEN_CODES.has(r.error?.code || '')) return;
      for (const uid of tokenOwners.get(tokens[i]) || []) {
        byUid.set(uid, [...(byUid.get(uid) || []), tokens[i]]);
      }
    });
    for (const [uid, dead] of byUid.entries()) {
      const ref = adminDb.collection('users').doc(uid);
      const u = (await ref.get()).data();
      const update: Record<string, unknown> = { fcmTokens: FieldValue.arrayRemove(...dead) };
      if (u?.fcmToken && dead.includes(u.fcmToken)) update.fcmToken = FieldValue.delete();
      await ref.update(update);
    }
  } catch (e) {
    console.error('[notify-server] limpieza de tokens muertos falló:', e);
  }
}

/**
 * Notifica a un usuario desde el servidor: campanita (Firestore) + push (FCM).
 *
 * El patrón estaba escrito inline en `/api/admin/refund-order` y se iba a repetir en cada
 * ruta que avisa algo (aprobar retiro, rechazar retiro...). Misma lección que `money.ts`:
 * duplicar es cómo se desincronizan las cosas.
 *
 * No lanza nunca: avisarle a alguien no debe abortar la operación que ya movió la plata.
 * Pero el fallo va a Sentry para que no quede invisible.
 *
 * `link` es a dónde va la app cuando el usuario toca la notificación. La campanita
 * (`src/components/notifications.tsx`) lo usa como fallback cuando no hay `orderId`.
 */
export async function notifyUser(opts: {
  userId: string;
  title: string;
  body: string;
  type: string;
  link?: string;
  orderId?: string;
}): Promise<void> {
  const { userId, title, body, type, link, orderId } = opts;
  if (!userId) return;

  try {
    await adminDb.collection('notifications').add({
      userId,
      title,
      body,
      type,
      ...(link ? { link } : {}),
      ...(orderId ? { orderId } : {}),
      read: false,
      createdAt: Timestamp.now(),
    });
  } catch (e) {
    console.error('[notify-server] No se pudo crear la notificación:', e);
    Sentry.captureException(e, { tags: { area: 'notify-server' }, extra: { userId, type } });
  }

  // Push. Va aparte del bloque de arriba a propósito: si falla el push, la campanita
  // (que es lo que de verdad garantiza que se entere) ya quedó escrita.
  try {
    const snap = await adminDb.collection('users').doc(userId).get();
    const u = snap.data();
    const tokens: string[] = [];
    if (u?.fcmToken) tokens.push(u.fcmToken);
    if (Array.isArray(u?.fcmTokens)) tokens.push(...u.fcmTokens);
    const uniq = [...new Set(tokens)].filter(Boolean);
    if (uniq.length === 0) return;

    const target = orderId ? `/orders/${orderId}` : (link || '/');
    const res = await adminMessaging.sendEachForMulticast({
      tokens: uniq,
      notification: { title, body },
      webpush: { fcmOptions: { link: target }, notification: { tag: pushTag(type, orderId, title) } },
      // `data.url` además del fcmOptions.link (Fase PP): el service worker en segundo
      // plano lee data.url — sin esto, todos los push de notifyUser abrían la home.
      data: { url: target },
    });
    await pruneDeadFcmTokens(uniq, res.responses, new Map(uniq.map(t => [t, [userId]])));
  } catch (e) {
    console.error('[notify-server] No se pudo mandar el push:', e);
  }
}
