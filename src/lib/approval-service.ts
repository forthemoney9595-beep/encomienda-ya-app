'use client';

// Aprobación/rechazo de cuentas (Fase PP) — LA función única que reemplaza los 5 caminos
// que había en el panel admin, cada uno escribiendo una combinación distinta de los 3
// campos que importan. Consecuencias reales de esa dispersión (auditadas):
// - repartidor aprobado desde el dashboard: podía trabajar (la regla lee users.isApproved)
//   pero figuraba "Pendiente" en Gestión Repartidores (que filtra por users.status)
// - tienda aprobada desde Gestión Tiendas: salía publicada (el catálogo lee
//   stores.isApproved) pero su dueño quedaba PARA SIEMPRE en la cola de solicitudes del
//   dashboard (que filtra por users.isApproved == false)
// - rechazar no sacaba a nadie de la cola (escribía isApproved:false, que ES el filtro)
//
// Regla: users.isApproved + users.status + stores.isApproved viajan SIEMPRE juntos, en un
// batch atómico. Y la persona SE ENTERA (hallazgo F3: aprobar era totalmente silencioso —
// el repartidor tenía que descubrir por las suyas que ya podía trabajar).

import {
  Firestore, doc, writeBatch, collection, query, where, getDocs, serverTimestamp,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { OrderService } from './order-service';
import { logAdminAction } from './admin-audit';

export async function setAccountApproval(db: Firestore, opts: {
  userId: string;
  approved: boolean;
  /** 'store' | 'delivery' — orienta la búsqueda de tienda y el texto del aviso. */
  role?: string;
  /** Si no viene y role es 'store', se busca por ownerId. */
  storeId?: string | null;
  /** Estado al des-aprobar. Default 'Rechazado'; la ficha del repartidor usa 'Inactivo'. */
  rejectedStatus?: string;
  /** Quién ejecuta: audita la acción y habilita el push del aviso. */
  adminUser?: User | null;
  label?: string;
  /** Default true. El aviso al usuario (campanita + push). */
  notify?: boolean;
}): Promise<void> {
  const { userId, approved } = opts;
  const userStatus = approved ? 'Activo' : (opts.rejectedStatus || 'Rechazado');

  let storeId = opts.storeId ?? null;
  if (!storeId && opts.role === 'store') {
    const snap = await getDocs(query(collection(db, 'stores'), where('ownerId', '==', userId)));
    storeId = snap.docs[0]?.id ?? null;
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', userId), {
    isApproved: approved,
    status: userStatus,
    updatedAt: serverTimestamp(),
  });
  if (storeId) {
    batch.update(doc(db, 'stores', storeId), {
      isApproved: approved,
      status: approved ? 'Aprobada' : 'Rechazada',
    });
  }
  await batch.commit();

  if (opts.adminUser) {
    logAdminAction(
      db, opts.adminUser.uid,
      approved ? 'approve_account' : 'reject_account',
      userId,
      opts.label || opts.role || '',
    );
  }

  if (opts.notify !== false) {
    const isStore = !!storeId || opts.role === 'store';
    await OrderService.sendNotification(
      db, userId,
      approved ? '✅ ¡Tu cuenta fue aprobada!' : 'Tu solicitud fue revisada',
      approved
        ? (isStore
            ? 'Tu tienda ya está publicada en EncomiendaYA. Cargá tus productos y horarios para empezar a vender.'
            : '¡Bienvenido al equipo! Ya podés conectarte y empezar a tomar pedidos.')
        : 'Esta vez no pudimos aprobar tu solicitud. Si creés que es un error, escribinos desde la página de soporte.',
      'admin',
      undefined,
      opts.adminUser ?? undefined,
    );
  }
}
