import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { adminDb } from '@/lib/firebase-admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { verifyAuthToken, verifyAdmin } from '@/lib/auth-server';
import { applyConfirmTimeout } from '@/lib/confirm-timeout-server';

/**
 * Reloj del recordatorio / cancelación automática de pedidos sin confirmar (Fase YY).
 *
 * La llaman los clientes que están MIRANDO el pedido (detalle del comprador, panel de la
 * tienda, Bandeja del admin) con timers al momento del recordatorio y del vencimiento. El
 * servidor no confía en ese reloj: decide con el suyo y el `createdAt` del pedido
 * (`confirm-timeout.ts`), dentro de una transacción. Idempotente: llamarla de más es gratis.
 * Vercel Hobby no permite un cron por minuto; con Pro, un cron reemplaza estas llamadas.
 *
 * Quién puede dispararla: el comprador de ESE pedido, el dueño de la tienda o un admin.
 * Responde `{ action: 'none'|'reminded'|'cancelled', reminderAt, timeoutAt }` (ms).
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(ip, 'orders:confirm-timeout', 60, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Espera un momento.' }, { status: 429 });
  }

  const callerUid = await verifyAuthToken(request);
  if (!callerUid) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let orderId = '';
  try {
    const body = await request.json().catch(() => ({}));
    orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    if (!orderId || orderId.length > 128 || orderId.includes('/')) {
      return NextResponse.json({ error: 'Falta orderId' }, { status: 400 });
    }

    const snap = await adminDb.collection('orders').doc(orderId).get();
    if (!snap.exists) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    const order = snap.data()!;

    // Autorización: comprador del pedido, dueño real de la tienda (stores/{id}.ownerId, no
    // el storeOwnerId denormalizado) o admin de cualquier nivel (es operativo, no plata).
    let authorized = order.userId === callerUid;
    if (!authorized && order.storeId) {
      const store = await adminDb.collection('stores').doc(String(order.storeId)).get();
      authorized = store.exists && store.data()?.ownerId === callerUid;
    }
    if (!authorized) authorized = await verifyAdmin(callerUid);
    if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

    const result = await applyConfirmTimeout(orderId, { source: 'api' });
    return NextResponse.json({
      action: result.action,
      reminderAt: result.reminderAt,
      timeoutAt: result.timeoutAt,
      status: result.status,
    });
  } catch (error) {
    console.error('Error en confirm-timeout:', error);
    Sentry.captureException(error, { tags: { route: 'orders/confirm-timeout' }, extra: { orderId } });
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
