import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import * as Sentry from '@sentry/nextjs';

/**
 * Igual que `logAdminAction` (cliente) pero desde el servidor, con Admin SDK.
 *
 * Por qué existe: las acciones que mueven plata (aprobar/rechazar un retiro, reembolsar) se
 * ejecutan en una API route, pero el registro de auditoría lo escribía el CLIENTE después,
 * en un `fetch` aparte. Si el navegador se cerraba, perdía conexión, o el usuario recargaba
 * justo ahí, la plata se movía y **no quedaba ningún rastro de quién la movió**. Ahora el
 * log se escribe en la misma request que hace la acción, con el uid ya verificado por token.
 *
 * Sigue sin lanzar: un fallo del log no debe abortar una transferencia ya hecha. Pero va a
 * Sentry para que no vuelva a quedar invisible (ver Fase GG).
 */
export async function logAdminActionServer(
  adminUid: string,
  action: string,
  targetId: string,
  detail?: string,
): Promise<void> {
  try {
    await adminDb.collection('admin_audit_log').add({
      adminUid,
      action,
      targetId,
      detail: detail || '',
      createdAt: Timestamp.now(),
      // Marca de origen: permite distinguir lo registrado por el servidor (confiable) de lo
      // que todavía escribe el cliente en las acciones que no mueven plata.
      source: 'server',
    });
  } catch (e) {
    console.error('[admin-audit-server] No se pudo registrar la acción:', e);
    Sentry.captureException(e, { tags: { area: 'admin-audit' }, extra: { action, targetId } });
  }
}
