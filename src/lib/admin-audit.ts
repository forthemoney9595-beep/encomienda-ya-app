import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import * as Sentry from '@sentry/nextjs';

// Escribe una entrada en admin_audit_log para rastrear acciones sensibles del admin.
// Si falla, no lanza un error para no interrumpir la acción principal (aprobar un retiro
// no debería abortarse porque el log falló).
//
// OJO (Fase GG): ese "no interrumpir" tragaba el error con un console.warn, y la colección
// no tenía regla en firestore.rules -> Firestore denegaba TODAS las escrituras y el log
// quedó vacío desde la Fase N sin ningún síntoma visible. Ahora el fallo va a Sentry: sigue
// sin romper la acción, pero deja de ser invisible.
export async function logAdminAction(
  firestore: Firestore,
  adminUid: string,
  action: string,
  targetId: string,
  detail?: string
): Promise<void> {
  try {
    await addDoc(collection(firestore, 'admin_audit_log'), {
      adminUid,
      action,
      targetId,
      detail: detail || '',
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('[admin-audit] No se pudo registrar la acción:', e);
    Sentry.captureException(e, { tags: { area: 'admin-audit' }, extra: { action, targetId } });
  }
}
