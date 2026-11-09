import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as Sentry from '@sentry/nextjs';
import { notifyUser } from '@/lib/notify-server';
import { logAdminActionServer } from '@/lib/admin-audit-server';
import {
  describeSuspensionEnd, isSuspendableRole, isSuspensionExpired, isSuspensionInForce, ownerPanelLink,
  reasonLabelOf, suspensionNoticeBody, suspensionUntilMs,
  type AccountSuspension, type SuspendableRole, type SuspensionReason,
} from '@/lib/suspension';

// Suspensión de cuentas con debido proceso (Fase YY ter, Tanda C). Núcleo server-side (Admin
// SDK): lo usan /api/admin/suspend-account, /api/admin/lift-suspension,
// /api/admin/resolve-appeal, /api/account/appeal, /api/account/suspension-check y el barrido
// diario del cron de conciliación. Todo lo que cambia el estado de la cuenta va en UNA
// transacción y por el MISMO mecanismo que approval-service (users.isApproved + users.status +
// stores.isApproved juntos — lección R1/PP R3): `isApprovedDriver()` de las reglas, la toma de
// pedidos (/api/orders/take), el catálogo y /api/orders/create ya leen esos campos, así que
// una suspensión corta todo eso sin tocar ninguno de esos caminos.
//
// Qué NO hace a propósito:
// - No le quita al repartidor los pedidos que YA lleva (un pedido no se abandona en la calle):
//   las reglas del pedido asignado y /api/orders/confirm-delivery no miran isApproved. Lo que
//   pierde es poder tomar NUEVOS. El admin ve cuántos lleva antes de confirmar.
// - No toca plata: lo ganado se le sigue debiendo (puede pedir el retiro manual; la
//   liquidación automática lo saltea mientras dure porque filtra isApproved).
// - En la tienda NO copia el motivo ni el detalle: `stores/{id}` es de lectura PÚBLICA. El
//   espejo ahí es mínimo ({active, at, until}); el detalle vive en users/{uid} (privado, lo lee
//   el dueño).

export class SuspensionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const SYSTEM = 'system';

async function isAdminUid(uid: string): Promise<boolean> {
  return (await adminDb.collection('roles_admin').doc(uid).get()).exists;
}

/** Busca la tienda del dueño dentro de la transacción (storeId del perfil o por ownerId). */
async function findStoreRef(tx: FirebaseFirestore.Transaction, uid: string, storeIdHint?: string | null) {
  if (storeIdHint) {
    const ref = adminDb.collection('stores').doc(storeIdHint);
    const s = await tx.get(ref);
    if (s.exists && s.data()?.ownerId === uid) return ref;
  }
  const q = await tx.get(adminDb.collection('stores').where('ownerId', '==', uid).limit(1));
  return q.docs[0]?.ref ?? null;
}

const accountName = (u: FirebaseFirestore.DocumentData | undefined) =>
  String(u?.displayName || u?.name || u?.email || 'la cuenta');

export interface SuspendResult {
  role: SuspendableRole;
  name: string;
  storeId: string | null;
  until: number | null;
  activeOrders: number;
}

export async function applySuspension(opts: {
  uid: string; reason: SuspensionReason; detail: string; durationDays: number | null; adminUid: string;
}): Promise<SuspendResult> {
  const { uid, reason, adminUid } = opts;
  const detail = opts.detail.trim();
  if (uid === adminUid) throw new SuspensionError(400, 'No podés suspender tu propia cuenta.');
  if (await isAdminUid(uid)) throw new SuspensionError(400, 'Las cuentas de administrador no se suspenden desde acá.');

  const userRef = adminDb.collection('users').doc(uid);
  const nowMs = Date.now();
  const untilMs = suspensionUntilMs(nowMs, opts.durationDays);
  let role = 'delivery' as SuspendableRole;
  let name = '';
  let storeId: string | null = null;

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new SuspensionError(404, 'La cuenta no existe.');
    const u = snap.data()!;
    if (!isSuspendableRole(u.role)) throw new SuspensionError(400, 'Solo se suspenden cuentas de repartidor o de tienda.');
    role = u.role;
    name = accountName(u);
    if (u.suspension?.active === true) throw new SuspensionError(409, 'La cuenta ya está suspendida.');
    if (u.isApproved !== true) {
      throw new SuspensionError(409, 'La cuenta no está aprobada: si es una solicitud nueva, rechazala desde Aprobaciones.');
    }
    const storeRef = role === 'store' ? await findStoreRef(tx, uid, u.storeId) : null;
    storeId = storeRef?.id ?? null;

    const at = Timestamp.fromMillis(nowMs);
    const until = untilMs === null ? null : Timestamp.fromMillis(untilMs);
    const suspension: AccountSuspension = {
      active: true, reason, detail, at, by: adminUid, until, durationDays: opts.durationDays ?? null,
      role, storeId, appealId: null, appealStatus: null, liftedAt: null, liftedBy: null, liftCause: null,
    };
    tx.update(userRef, {
      isApproved: false,
      status: 'Suspendido',
      suspension,
      suspensionCount: FieldValue.increment(1),
      updatedAt: at,
    });
    if (storeRef) {
      tx.update(storeRef, { isApproved: false, status: 'Suspendida', suspension: { active: true, at, until } });
    }
  });

  // Pedidos que YA lleva (repartidor) o que tiene en curso (tienda): se informan, no se tocan.
  let activeOrders = 0;
  try {
    const q = role === 'delivery'
      ? adminDb.collection('orders').where('deliveryPersonId', '==', uid).where('status', 'in', ['En camino', 'En reparto'])
      : adminDb.collection('orders').where('storeId', '==', storeId || '__none__').where('status', 'in', ['Pendiente de Confirmación', 'Pendiente de Pago', 'En preparación', 'Listo para recoger', 'En camino', 'En reparto']);
    activeOrders = (await q.count().get()).data().count;
  } catch (e) {
    Sentry.captureException(e, { tags: { area: 'suspension', step: 'active-orders' } });
  }

  await notifyUser({
    userId: uid,
    title: role === 'store' ? 'Tu tienda fue suspendida' : 'Tu cuenta fue suspendida',
    body: suspensionNoticeBody({ reason, detail, until: untilMs, role }) +
      (role === 'delivery' && activeOrders > 0 ? ` Los ${activeOrders} pedido(s) que ya llevás los podés terminar.` : ''),
    type: 'account_status',
    link: ownerPanelLink(role),
  });
  await logAdminActionServer(adminUid, 'suspend_account', uid,
    `${role === 'store' ? 'tienda' : 'repartidor'} ${name} · ${reasonLabelOf(reason)} · ${describeSuspensionEnd(untilMs)}` +
    `${activeOrders ? ` · ${activeOrders} pedido(s) en curso` : ''} · ${detail.slice(0, 160)}`);

  return { role, name, storeId, until: untilMs, activeOrders };
}

export type LiftCause = 'appeal' | 'expired' | 'admin';

/**
 * Levanta una suspensión activa (vuelve a dejar la cuenta aprobada). Si había una apelación
 * ABIERTA y se levanta por otro camino (vencimiento o el admin a mano), la apelación se cierra
 * en la misma transacción — si no, quedaría para siempre en la Bandeja.
 * Devuelve false si no había nada para levantar (p. ej. el vencimiento ya lo aplicó otro).
 */
export async function liftSuspension(opts: {
  uid: string; by: string; cause: LiftCause; note?: string; appealId?: string;
}): Promise<{ lifted: boolean; role?: SuspendableRole; name?: string }> {
  const { uid, cause } = opts;
  const note = (opts.note || '').trim();
  const userRef = adminDb.collection('users').doc(uid);
  let role = 'delivery' as SuspendableRole;
  let name = '';
  let lifted = false;

  await adminDb.runTransaction(async (tx) => {
    lifted = false;
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new SuspensionError(404, 'La cuenta no existe.');
    const u = snap.data()!;
    const s = u.suspension as AccountSuspension | undefined;
    if (!s || s.active !== true) {
      if (cause === 'expired') return; // ya lo levantó otro (aviso + barrido a la vez)
      throw new SuspensionError(409, 'La cuenta no está suspendida.');
    }
    // El vencimiento lo decide el reloj del SERVIDOR, nunca el del navegador.
    if (cause === 'expired' && !isSuspensionExpired(s, Date.now())) return;
    if (cause === 'appeal' && s.appealId !== opts.appealId) {
      throw new SuspensionError(409, 'La apelación no corresponde a la suspensión vigente.');
    }
    role = isSuspendableRole(u.role) ? u.role : (s.role ?? 'delivery');
    name = accountName(u);

    const storeRef = role === 'store' ? await findStoreRef(tx, uid, s.storeId ?? u.storeId) : null;
    const appealRef = s.appealId ? adminDb.collection('account_appeals').doc(s.appealId) : null;
    const appealSnap = appealRef ? await tx.get(appealRef) : null;

    const now = Timestamp.now();
    // Una apelación abierta (o la que se está resolviendo) queda como reactivada; una ya
    // "mantenida" conserva su historia aunque después la suspensión venza.
    const appealStatus = (cause === 'appeal' || s.appealStatus === 'open') ? 'reactivated' : (s.appealStatus ?? null);
    tx.update(userRef, {
      isApproved: true,
      status: 'Activo',
      'suspension.active': false,
      'suspension.liftedAt': now,
      'suspension.liftedBy': opts.by,
      'suspension.liftCause': cause,
      'suspension.appealStatus': appealStatus,
      updatedAt: now,
    });
    if (storeRef) {
      tx.update(storeRef, { isApproved: true, status: 'Aprobada', 'suspension.active': false });
    }
    // Apelación abierta que se cierra por otro camino (o por esta misma decisión).
    if (appealRef && appealSnap?.exists && appealSnap.data()?.resolved !== true) {
      tx.update(appealRef, {
        resolved: true,
        status: 'reactivated',
        resolvedAt: now,
        resolvedBy: opts.by,
        response: note || (cause === 'expired'
          ? 'La suspensión terminó por vencimiento del plazo.'
          : cause === 'admin' ? 'La administración levantó la suspensión.' : ''),
      });
    }
    lifted = true;
  });

  if (!lifted) return { lifted: false };

  const title = role === 'store' ? 'Tu tienda volvió a estar activa' : 'Tu cuenta volvió a estar activa';
  const why = cause === 'expired'
    ? 'Terminó el plazo de la suspensión.'
    : cause === 'appeal' ? 'Revisamos tu apelación y levantamos la suspensión.' : 'La administración levantó la suspensión.';
  await notifyUser({
    userId: uid, title,
    body: `${why}${note ? ` ${note}` : ''} ${role === 'store' ? 'Ya podés recibir pedidos.' : 'Ya podés volver a tomar pedidos.'}`,
    type: 'account_status', link: ownerPanelLink(role),
  });
  if (cause === 'expired') {
    await logAdminActionServer(SYSTEM, 'suspension_expired', uid, `${role === 'store' ? 'tienda' : 'repartidor'} ${name} · se levantó sola al vencer`);
  } else if (cause === 'admin') {
    await logAdminActionServer(opts.by, 'lift_suspension', uid, `${role === 'store' ? 'tienda' : 'repartidor'} ${name}${note ? ` · ${note.slice(0, 160)}` : ''}`);
  }
  return { lifted: true, role, name };
}

/** Apelación del dueño. Una por suspensión, y solo si no hay otra abierta. */
export async function createAppeal(opts: { uid: string; text: string }): Promise<{ appealId: string }> {
  const { uid } = opts;
  const text = opts.text.trim();
  const userRef = adminDb.collection('users').doc(uid);
  const appealRef = adminDb.collection('account_appeals').doc();
  let role = 'delivery' as SuspendableRole;
  let name = '';

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const u = snap.data();
    const s = u?.suspension as AccountSuspension | undefined;
    if (!u || !s || s.active !== true) throw new SuspensionError(409, 'Tu cuenta no tiene una suspensión activa.');
    if (!isSuspensionInForce(s, Date.now())) throw new SuspensionError(409, 'Tu suspensión ya venció: recargá la página.');
    if (s.appealId) throw new SuspensionError(409, 'Ya apelaste esta suspensión. Te vamos a responder por escrito.');
    const open = await tx.get(adminDb.collection('account_appeals').where('uid', '==', uid).where('resolved', '==', false).limit(1));
    if (!open.empty) throw new SuspensionError(409, 'Ya tenés una apelación en revisión.');

    role = isSuspendableRole(u.role) ? u.role : (s.role ?? 'delivery');
    name = accountName(u);
    const now = Timestamp.now();
    tx.create(appealRef, {
      uid, role, accountName: name, storeId: s.storeId ?? null,
      suspensionAt: s.at ?? null, suspensionReason: s.reason, suspensionDetail: s.detail,
      suspensionUntil: s.until ?? null, suspendedBy: s.by,
      text, status: 'open', resolved: false, createdAt: now,
    });
    tx.update(userRef, { 'suspension.appealId': appealRef.id, 'suspension.appealStatus': 'open', updatedAt: now });
  });

  await notifyUser({
    userId: uid, title: 'Recibimos tu apelación',
    body: 'La administración la va a revisar y te va a responder por escrito por este mismo medio.',
    type: 'account_status', link: ownerPanelLink(role),
  });
  // Aviso a los admins (set chico): la apelación también aparece en la Bandeja con su chip.
  try {
    const admins = await adminDb.collection('roles_admin').limit(20).get();
    await Promise.all(admins.docs.map(a => notifyUser({
      userId: a.id, title: `Apelación de ${role === 'store' ? 'tienda' : 'repartidor'}: ${name}`,
      body: text.slice(0, 160), type: 'admin', link: '/admin/inbox',
    })));
  } catch (e) {
    Sentry.captureException(e, { tags: { area: 'suspension', step: 'notify-admins' } });
  }
  return { appealId: appealRef.id };
}

/** Decisión del admin sobre una apelación: reactivar (levanta la suspensión) o mantener. */
export async function resolveAppeal(opts: {
  appealId: string; decision: 'reactivate' | 'maintain'; response: string; adminUid: string;
}): Promise<{ uid: string; role: SuspendableRole }> {
  const { appealId, decision, adminUid } = opts;
  const response = opts.response.trim();
  const appealRef = adminDb.collection('account_appeals').doc(appealId);
  const pre = await appealRef.get();
  if (!pre.exists) throw new SuspensionError(404, 'La apelación no existe.');
  const uid = String(pre.data()!.uid);
  const role: SuspendableRole = isSuspendableRole(pre.data()!.role) ? pre.data()!.role : 'delivery';
  const name = String(pre.data()!.accountName || '');
  if (pre.data()!.resolved === true) throw new SuspensionError(409, 'La apelación ya fue resuelta.');

  if (decision === 'reactivate') {
    // Mismo camino que cualquier levantamiento (transacción única, cierra la apelación).
    const r = await liftSuspension({ uid, by: adminUid, cause: 'appeal', note: response, appealId });
    if (!r.lifted) throw new SuspensionError(409, 'La suspensión ya no estaba activa.');
  } else {
    const userRef = adminDb.collection('users').doc(uid);
    await adminDb.runTransaction(async (tx) => {
      const a = await tx.get(appealRef);
      if (!a.exists || a.data()?.resolved === true) throw new SuspensionError(409, 'La apelación ya fue resuelta.');
      const u = (await tx.get(userRef)).data();
      const s = u?.suspension as AccountSuspension | undefined;
      if (!s || s.active !== true || s.appealId !== appealId) {
        throw new SuspensionError(409, 'La suspensión de esta apelación ya no está vigente.');
      }
      const now = Timestamp.now();
      tx.update(appealRef, { resolved: true, status: 'maintained', response, resolvedAt: now, resolvedBy: adminUid });
      tx.update(userRef, { 'suspension.appealStatus': 'maintained', updatedAt: now });
    });
    const s = (await adminDb.collection('users').doc(uid).get()).data()?.suspension as AccountSuspension | undefined;
    await notifyUser({
      userId: uid,
      title: 'Respuesta a tu apelación: la suspensión se mantiene',
      body: `${response} La suspensión sigue ${describeSuspensionEnd(s?.until ?? null)}.`,
      type: 'account_status', link: ownerPanelLink(role),
    });
  }
  await logAdminActionServer(adminUid, 'resolve_appeal', uid,
    `${role === 'store' ? 'tienda' : 'repartidor'} ${name} · ${decision === 'reactivate' ? 'reactivada' : 'se mantiene'}${response ? ` · ${response.slice(0, 160)}` : ''}`);
  return { uid, role };
}

/**
 * Barrido diario (cron de conciliación y "Conciliar ahora"): levanta las suspensiones con
 * plazo vencido que nadie disparó desde su aviso. Consulta acotada: igualdad sobre
 * `suspension.active` (índice de un campo, automático) + limit; el corte por fecha se hace en
 * memoria (el set de suspendidos es chico).
 */
export async function sweepExpiredSuspensions(limit = 200): Promise<{ checked: number; lifted: number; errors: number }> {
  const snap = await adminDb.collection('users').where('suspension.active', '==', true).limit(limit).get();
  const now = Date.now();
  let lifted = 0, errors = 0;
  for (const d of snap.docs) {
    const s = d.data().suspension;
    if (!isSuspensionExpired(s, now)) continue;
    try {
      const r = await liftSuspension({ uid: d.id, by: SYSTEM, cause: 'expired' });
      if (r.lifted) lifted++;
    } catch (e) {
      errors++;
      Sentry.captureException(e, { tags: { area: 'suspension', step: 'sweep' }, extra: { uid: d.id } });
    }
  }
  return { checked: snap.size, lifted, errors };
}

export function suspensionErrorResponse(e: unknown): { status: number; error: string } | null {
  if (e instanceof SuspensionError) return { status: e.status, error: e.message };
  return null;
}

