import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

// Escribe una entrada en admin_audit_log para rastrear acciones sensibles del admin.
// Si falla, no lanza un error para no interrumpir la acción principal.
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
    console.warn('[admin-audit] No se pudo registrar la acción:', e);
  }
}
