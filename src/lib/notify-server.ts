import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import * as Sentry from '@sentry/nextjs';

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

    await adminMessaging.sendEachForMulticast({
      tokens: uniq,
      notification: { title, body },
      webpush: { fcmOptions: { link: orderId ? `/orders/${orderId}` : (link || '/') } },
    }).catch(() => { /* tokens vencidos: no es un error que valga la pena reportar */ });
  } catch (e) {
    console.error('[notify-server] No se pudo mandar el push:', e);
  }
}
