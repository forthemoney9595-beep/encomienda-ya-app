/**
 * Tests de REGLAS de Firestore contra el emulador (ARQ-026 / TEST-002, auditoría oct 2026).
 *
 * Corren con `npm run test:rules` (levanta el emulador, corre esto y lo apaga) — necesitan
 * Java. Se saltean solos en `npm run test` (no hay emulador): así la suite unitaria sigue
 * siendo rápida y sin dependencias. Las reglas que se cargan son las del repo
 * (`firestore.rules`), no las de producción: esto prueba lo que se va a desplegar ANTES de
 * desplegarlo. Los scripts `_attack-*.js` siguen valiendo como prueba contra producción.
 *
 * Primer caso: ARQ-003 (un repartidor no puede "des-entregar" su pedido) + PERF-004 (la
 * posición en vivo va al subdoc `live/driver`, nunca al doc del pedido) + el gate de
 * aprobación de repartidores. Agregar acá cada endurecimiento nuevo de reglas, con su
 * regresión (lección LL: bloquear al atacante no sirve si también bloqueás al usuario real).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

const HAS_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-encomiendaya-rules';
const DRIVER = 'driver-uid';
const OTHER_DRIVER = 'other-driver-uid';
const BUYER = 'buyer-uid';
const STORE_OWNER = 'store-owner-uid';

let env: RulesTestEnvironment;

describe.skipIf(!HAS_EMULATOR)('firestore.rules — pedidos del repartidor', () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT,
      firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
    });
  });
  afterAll(async () => { await env?.cleanup(); });

  beforeEach(async () => {
    await env.clearFirestore();
    // Semilla con reglas apagadas: usuarios (repartidor aprobado, otro no aprobado, comprador,
    // dueño), una tienda y pedidos en distintos estados asignados al repartidor.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', DRIVER), { role: 'delivery', isApproved: true, email: 'd@test' });
      await setDoc(doc(db, 'users', OTHER_DRIVER), { role: 'delivery', isApproved: false, email: 'o@test' });
      await setDoc(doc(db, 'users', BUYER), { role: 'buyer', email: 'b@test' });
      await setDoc(doc(db, 'users', STORE_OWNER), { role: 'store', isApproved: true, storeId: 'store-1', email: 's@test' });
      await setDoc(doc(db, 'stores', 'store-1'), { ownerId: STORE_OWNER, name: 'Tienda', isApproved: true });
      const base = { storeId: 'store-1', userId: BUYER, customerName: 'Cliente', items: [], total: 1000, deliveryPersonId: DRIVER };
      await setDoc(doc(db, 'orders', 'o-camino'), { ...base, status: 'En camino' });
      await setDoc(doc(db, 'orders', 'o-reparto'), { ...base, status: 'En reparto' });
      await setDoc(doc(db, 'orders', 'o-entregado'), { ...base, status: 'Entregado' });
      await setDoc(doc(db, 'orders', 'o-cancelado'), { ...base, status: 'Cancelado' });
    });
  });

  const asDriver = () => env.authenticatedContext(DRIVER).firestore();
  const asOther = () => env.authenticatedContext(OTHER_DRIVER).firestore();
  const asBuyer = () => env.authenticatedContext(BUYER).firestore();

  // ───── ARQ-003: máquina de estados del repartidor ─────
  it("regresión: 'En camino' → 'En reparto' por el repartidor asignado PASA", async () => {
    await assertSucceeds(updateDoc(doc(asDriver(), 'orders', 'o-camino'), { status: 'En reparto', pickedUpAt: new Date() }));
  });
  it("ataque: 'Entregado' → 'En reparto' (des-entregar) se BLOQUEA", async () => {
    await assertFails(updateDoc(doc(asDriver(), 'orders', 'o-entregado'), { status: 'En reparto' }));
  });
  it("ataque: 'Cancelado' → 'En reparto' se BLOQUEA", async () => {
    await assertFails(updateDoc(doc(asDriver(), 'orders', 'o-cancelado'), { status: 'En reparto' }));
  });
  it("ataque: 'En reparto' → 'En camino' (volver atrás) se BLOQUEA", async () => {
    await assertFails(updateDoc(doc(asDriver(), 'orders', 'o-reparto'), { status: 'En camino' }));
  });
  it("ataque: 'Entregado' directo (sin PIN) se BLOQUEA", async () => {
    await assertFails(updateDoc(doc(asDriver(), 'orders', 'o-reparto'), { status: 'Entregado' }));
  });
  it('ataque: otro repartidor no toca un pedido ajeno', async () => {
    await assertFails(updateDoc(doc(asOther(), 'orders', 'o-camino'), { status: 'En reparto' }));
  });

  // ───── PERF-004: posición en vivo ─────
  it('ataque: driverCoords en el doc del pedido se BLOQUEA (va al subdoc)', async () => {
    await assertFails(updateDoc(doc(asDriver(), 'orders', 'o-reparto'), { driverCoords: { latitude: -28.06, longitude: -67.56 } }));
  });
  it('regresión: live/driver con forma válida en un pedido en la calle PASA', async () => {
    await assertSucceeds(setDoc(doc(asDriver(), 'orders', 'o-reparto', 'live', 'driver'), { latitude: -28.06, longitude: -67.56, lastUpdate: 'now' }));
    await assertSucceeds(setDoc(doc(asDriver(), 'orders', 'o-camino', 'live', 'driver'), { latitude: -28.06, longitude: -67.56, lastUpdate: 'now' }));
  });
  it('ataque: live/driver en un pedido Entregado, con forma inválida, o por otro repartidor se BLOQUEA', async () => {
    await assertFails(setDoc(doc(asDriver(), 'orders', 'o-entregado', 'live', 'driver'), { latitude: -28.06, longitude: -67.56 }));
    await assertFails(setDoc(doc(asDriver(), 'orders', 'o-reparto', 'live', 'driver'), { latitude: 'x', longitude: -67.56 }));
    await assertFails(setDoc(doc(asDriver(), 'orders', 'o-reparto', 'live', 'driver'), { latitude: -28.06, longitude: -67.56, extra: 1 }));
    await assertFails(setDoc(doc(asOther(), 'orders', 'o-reparto', 'live', 'driver'), { latitude: -28.06, longitude: -67.56 }));
  });
  it('lectura de live/driver: comprador del pedido y repartidor asignado SÍ; otro repartidor NO', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o-reparto', 'live', 'driver'), { latitude: -28.06, longitude: -67.56 });
    });
    await assertSucceeds(getDoc(doc(asBuyer(), 'orders', 'o-reparto', 'live', 'driver')));
    await assertSucceeds(getDoc(doc(asDriver(), 'orders', 'o-reparto', 'live', 'driver')));
    await assertFails(getDoc(doc(asOther(), 'orders', 'o-reparto', 'live', 'driver')));
  });
  it('borrar live/driver: el repartidor asignado SÍ (es lo que hace entregar)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o-reparto', 'live', 'driver'), { latitude: -28.06, longitude: -67.56 });
    });
    await assertSucceeds(deleteDoc(doc(asDriver(), 'orders', 'o-reparto', 'live', 'driver')));
  });

  // ───── Gate de aprobación / pool ─────
  it('el pool de pedidos libres solo lo lee un repartidor APROBADO (un comprador, no)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o-libre'), { storeId: 'store-1', userId: 'otro', customerName: 'X', items: [], total: 1, deliveryPersonId: null, status: 'Listo para recoger' });
    });
    await assertSucceeds(getDoc(doc(asDriver(), 'orders', 'o-libre')));
    await assertFails(getDoc(doc(asOther(), 'orders', 'o-libre')));
    await assertFails(getDoc(doc(asBuyer(), 'orders', 'o-libre')));
  });
});

describe.skipIf(!HAS_EMULATOR)('firestore.rules — comprador y plata', () => {
  // Entorno propio: el del describe anterior ya hizo cleanup() en su afterAll.
  let env2: RulesTestEnvironment;
  beforeAll(async () => {
    env2 = await initializeTestEnvironment({ projectId: PROJECT + '-2', firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  });
  afterAll(async () => { await env2?.cleanup(); });
  beforeEach(async () => {
    await env2.clearFirestore();
    await env2.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', BUYER), { role: 'buyer', email: 'b@test' });
      await setDoc(doc(db, 'orders', 'o-mio'), { storeId: 'store-1', userId: BUYER, customerName: 'Cliente', items: [{ id: 'p1', price: 1000, quantity: 1 }], total: 1000, status: 'Pendiente de Pago', deliveryPersonId: null });
    });
  });
  it('ataque: el comprador no puede reescribir items/total de su pedido', async () => {
    const db = env2.authenticatedContext(BUYER).firestore();
    await assertFails(updateDoc(doc(db, 'orders', 'o-mio'), { total: 1 }));
    await assertFails(updateDoc(doc(db, 'orders', 'o-mio'), { items: [{ id: 'p1', price: 1, quantity: 1 }] }));
  });
  it('ataque: nadie crea retiros por escritura directa (van por /api/withdrawals/request)', async () => {
    const db = env2.authenticatedContext(BUYER).firestore();
    await assertFails(setDoc(doc(db, 'withdrawals', 'w1'), { userId: BUYER, amount: 99999999, status: 'pending' }));
  });
});

describe.skipIf(!HAS_EMULATOR)('firestore.rules — platform_daily (cierres diarios, Tanda T2)', () => {
  // Misma regla que platform_monthly: solo lectura para el admin; NADIE escribe desde el
  // cliente (los cierres los calcula el cron de conciliación con Admin SDK).
  const ADMIN = 'admin-uid';
  let env3: RulesTestEnvironment;
  beforeAll(async () => {
    env3 = await initializeTestEnvironment({ projectId: PROJECT + '-3', firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  });
  afterAll(async () => { await env3?.cleanup(); });
  beforeEach(async () => {
    await env3.clearFirestore();
    await env3.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'roles_admin', ADMIN), { level: 'full' });
      await setDoc(doc(db, 'users', ADMIN), { role: 'admin', email: 'a@test' });
      await setDoc(doc(db, 'users', BUYER), { role: 'buyer', email: 'b@test' });
      await setDoc(doc(db, 'platform_daily', '2026-10-20'), { ymd: '2026-10-20', delivered: 3, platform: 1500 });
    });
  });
  it('regresión: el admin lee un cierre diario', async () => {
    await assertSucceeds(getDoc(doc(env3.authenticatedContext(ADMIN).firestore(), 'platform_daily', '2026-10-20')));
  });
  it('ataque: un comprador (o un anónimo) no lee los cierres', async () => {
    await assertFails(getDoc(doc(env3.authenticatedContext(BUYER).firestore(), 'platform_daily', '2026-10-20')));
    await assertFails(getDoc(doc(env3.unauthenticatedContext().firestore(), 'platform_daily', '2026-10-20')));
  });
  it('ataque: ni siquiera el admin crea, edita o borra un cierre desde el cliente (solo Admin SDK)', async () => {
    const db = env3.authenticatedContext(ADMIN).firestore();
    await assertFails(setDoc(doc(db, 'platform_daily', '2026-10-21'), { ymd: '2026-10-21', platform: 1 }));
    await assertFails(updateDoc(doc(db, 'platform_daily', '2026-10-20'), { platform: 999999 }));
    await assertFails(deleteDoc(doc(db, 'platform_daily', '2026-10-20')));
  });
});

describe.skipIf(!HAS_EMULATOR)('firestore.rules — pausa con tiempo de la tienda (Fase YY)', () => {
  // El dueño escribe `pausedUntil` junto con `manuallyPaused` desde /my-store (campo nuevo
  // del hasOnly del update del dueño). Regresión: sigue sin poder tocar aprobación/rating.
  const OTHER = 'otro-uid';
  let env4: RulesTestEnvironment;
  beforeAll(async () => {
    env4 = await initializeTestEnvironment({ projectId: PROJECT + '-4', firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  });
  afterAll(async () => { await env4?.cleanup(); });
  beforeEach(async () => {
    await env4.clearFirestore();
    await env4.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', STORE_OWNER), { role: 'store', isApproved: true, storeId: 'store-1', email: 's@test' });
      await setDoc(doc(db, 'users', OTHER), { role: 'store', isApproved: true, storeId: 'store-2', email: 'o@test' });
      await setDoc(doc(db, 'stores', 'store-1'), { ownerId: STORE_OWNER, name: 'Tienda', isApproved: true, rating: 4, manuallyPaused: false });
    });
  });
  const asOwner = () => env4.authenticatedContext(STORE_OWNER).firestore();
  it('regresión: el dueño pausa 30 min (manuallyPaused + pausedUntil) y reactiva', async () => {
    await assertSucceeds(updateDoc(doc(asOwner(), 'stores', 'store-1'), { manuallyPaused: true, pausedUntil: new Date(Date.now() + 30 * 60_000) }));
    await assertSucceeds(updateDoc(doc(asOwner(), 'stores', 'store-1'), { manuallyPaused: false, pausedUntil: null }));
  });
  it('ataque: el dueño sigue sin poder escribir isApproved ni rating (ni colándolos con pausedUntil)', async () => {
    await assertFails(updateDoc(doc(asOwner(), 'stores', 'store-1'), { pausedUntil: new Date(), isApproved: false }));
    await assertFails(updateDoc(doc(asOwner(), 'stores', 'store-1'), { pausedUntil: new Date(), rating: 5 }));
    await assertFails(updateDoc(doc(asOwner(), 'stores', 'store-1'), { ratingCount: 99 }));
  });
  it('ataque: otro dueño no pausa una tienda ajena', async () => {
    await assertFails(updateDoc(doc(env4.authenticatedContext(OTHER).firestore(), 'stores', 'store-1'), { manuallyPaused: true, pausedUntil: new Date() }));
  });
});

describe.skipIf(!HAS_EMULATOR)('firestore.rules — quién absorbe el reembolso y señales antifraude (Fase YY bis)', () => {
  // `refundAllocation` lo escribe SOLO /api/admin/refund-order (Admin SDK): define cuánto se
  // le descuenta a la tienda y al repartidor. `claim_risk` es admin-only: el comprador lee su
  // propio reclamo, pero no puede ver que lo marcaron.
  const ADMIN = 'admin-uid';
  let env5: RulesTestEnvironment;
  beforeAll(async () => {
    env5 = await initializeTestEnvironment({ projectId: PROJECT + '-5', firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  });
  afterAll(async () => { await env5?.cleanup(); });
  beforeEach(async () => {
    await env5.clearFirestore();
    await env5.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'roles_admin', ADMIN), { level: 'full' });
      await setDoc(doc(db, 'users', ADMIN), { role: 'admin', email: 'a@test' });
      await setDoc(doc(db, 'users', BUYER), { role: 'buyer', email: 'b@test' });
      await setDoc(doc(db, 'orders', 'o-reemb'), {
        storeId: 'store-1', userId: BUYER, customerName: 'C', items: [], status: 'Entregado',
        total: 12500, subtotal: 10000, deliveryFee: 2000, serviceFee: 500, refunded: true, refundAmount: 2500,
        refundAllocation: { store: 2500, driver: 0, platform: 0 }, refundAllocationPreset: 'store',
      });
      await setDoc(doc(db, 'claims', 'c-1'), { userId: BUYER, orderId: 'o-reemb', type: 'not_received', resolved: false });
      await setDoc(doc(db, 'claim_risk', 'c-1'), { claimId: 'c-1', userId: BUYER, signals: [{ code: 'pin_verified_not_received' }], resolved: false });
    });
  });
  const asAdmin = () => env5.authenticatedContext(ADMIN).firestore();
  const asBuyer5 = () => env5.authenticatedContext(BUYER).firestore();

  it('ataque: el admin NO reescribe refundAllocation (ni el preset) por escritura directa', async () => {
    await assertFails(updateDoc(doc(asAdmin(), 'orders', 'o-reemb'), { refundAllocation: { store: 0, driver: 2500, platform: 0 } }));
    await assertFails(updateDoc(doc(asAdmin(), 'orders', 'o-reemb'), { refundAllocationPreset: 'driver' }));
  });
  it('regresión: el admin sigue pudiendo escribir un campo operativo del pedido', async () => {
    await assertSucceeds(updateDoc(doc(asAdmin(), 'orders', 'o-reemb'), { adminNote: 'revisado' }));
  });
  it('ataque: el comprador tampoco toca refundAllocation de su pedido', async () => {
    await assertFails(updateDoc(doc(asBuyer5(), 'orders', 'o-reemb'), { refundAllocation: { store: 0, driver: 0, platform: 2500 } }));
  });
  it('claim_risk: el admin lo lee; el dueño del reclamo NO (aunque sí lee su reclamo)', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), 'claim_risk', 'c-1')));
    await assertSucceeds(getDoc(doc(asBuyer5(), 'claims', 'c-1')));
    await assertFails(getDoc(doc(asBuyer5(), 'claim_risk', 'c-1')));
    await assertFails(getDoc(doc(env5.unauthenticatedContext().firestore(), 'claim_risk', 'c-1')));
  });
  it('claim_risk: nadie lo escribe desde el cliente, ni el admin', async () => {
    await assertFails(setDoc(doc(asAdmin(), 'claim_risk', 'c-2'), { claimId: 'c-2', signals: [] }));
    await assertFails(updateDoc(doc(asAdmin(), 'claim_risk', 'c-1'), { resolved: true }));
    await assertFails(deleteDoc(doc(asAdmin(), 'claim_risk', 'c-1')));
  });
});

describe.skipIf(!HAS_EMULATOR)('firestore.rules — suspensión con debido proceso (Fase YY ter)', () => {
  // La suspensión la aplica /api/admin/suspend-account (Admin SDK) con el MISMO mecanismo que
  // la aprobación (isApproved/status). Acá: el dueño no puede escribirse `suspension` ni
  // reactivarse; el admin tampoco lo hace desde el cliente (la ruta exige motivo, avisa y
  // audita); las apelaciones solo las lee su dueño o el admin y nadie las escribe; y el
  // repartidor suspendido no toma pedidos nuevos pero SÍ termina el que ya lleva.
  const ADMIN = 'admin-uid';
  const SUSP_DRIVER = 'susp-driver-uid';
  const SUSP_OWNER = 'susp-owner-uid';
  const PENDING_DRIVER = 'pending-driver-uid';
  const suspension = { active: true, reason: 'conduct', detail: 'Trato agresivo con dos clientes esta semana.', by: ADMIN, until: null };
  let env6: RulesTestEnvironment;
  beforeAll(async () => {
    env6 = await initializeTestEnvironment({ projectId: PROJECT + '-6', firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  });
  afterAll(async () => { await env6?.cleanup(); });
  beforeEach(async () => {
    await env6.clearFirestore();
    await env6.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'roles_admin', ADMIN), { level: 'support' });
      await setDoc(doc(db, 'users', ADMIN), { role: 'admin', adminLevel: 'support', email: 'a@test' });
      await setDoc(doc(db, 'users', SUSP_DRIVER), { role: 'delivery', isApproved: false, status: 'Suspendido', suspension, email: 'sd@test' });
      await setDoc(doc(db, 'users', SUSP_OWNER), { role: 'store', isApproved: false, status: 'Suspendido', storeId: 'store-s', suspension, email: 'so@test' });
      await setDoc(doc(db, 'users', PENDING_DRIVER), { role: 'delivery', isApproved: false, status: 'Pendiente', email: 'pd@test' });
      await setDoc(doc(db, 'users', BUYER), { role: 'buyer', email: 'b@test' });
      await setDoc(doc(db, 'stores', 'store-s'), { ownerId: SUSP_OWNER, name: 'Suspendida', isApproved: false, status: 'Suspendida', suspension: { active: true } });
      const base = { storeId: 'store-x', userId: BUYER, customerName: 'C', items: [], total: 1000 };
      await setDoc(doc(db, 'orders', 'o-libre'), { ...base, status: 'Listo para recoger', deliveryPersonId: null });
      await setDoc(doc(db, 'orders', 'o-suyo'), { ...base, status: 'En camino', deliveryPersonId: SUSP_DRIVER });
      await setDoc(doc(db, 'account_appeals', 'ap-1'), { uid: SUSP_DRIVER, role: 'delivery', text: 'No fui yo, el cliente se equivocó de repartidor.', resolved: false, status: 'open' });
    });
  });
  const as = (uid: string) => env6.authenticatedContext(uid).firestore();

  it('ataque: el repartidor suspendido no se reactiva ni se borra la suspensión', async () => {
    await assertFails(updateDoc(doc(as(SUSP_DRIVER), 'users', SUSP_DRIVER), { isApproved: true }));
    await assertFails(updateDoc(doc(as(SUSP_DRIVER), 'users', SUSP_DRIVER), { status: 'Activo' }));
    await assertFails(updateDoc(doc(as(SUSP_DRIVER), 'users', SUSP_DRIVER), { suspension: { active: false } }));
    await assertFails(updateDoc(doc(as(SUSP_DRIVER), 'users', SUSP_DRIVER), { 'suspension.active': false }));
    await assertFails(updateDoc(doc(as(SUSP_DRIVER), 'users', SUSP_DRIVER), { suspensionCount: 0 }));
  });
  it('regresión: el suspendido sigue editando su perfil (nombre, disponibilidad)', async () => {
    await assertSucceeds(updateDoc(doc(as(SUSP_DRIVER), 'users', SUSP_DRIVER), { name: 'Nuevo nombre', isOnline: false }));
  });
  it('ataque: la tienda suspendida no se re-publica ni toca su espejo de suspensión', async () => {
    await assertFails(updateDoc(doc(as(SUSP_OWNER), 'stores', 'store-s'), { isApproved: true }));
    await assertFails(updateDoc(doc(as(SUSP_OWNER), 'stores', 'store-s'), { status: 'Aprobada' }));
    await assertFails(updateDoc(doc(as(SUSP_OWNER), 'stores', 'store-s'), { suspension: { active: false } }));
  });
  it('regresión: la tienda suspendida sigue editando su descripción', async () => {
    await assertSucceeds(updateDoc(doc(as(SUSP_OWNER), 'stores', 'store-s'), { description: 'Volvemos pronto' }));
  });
  it('ataque: ni el admin escribe suspension ni re-aprueba una cuenta suspendida desde el cliente', async () => {
    await assertFails(updateDoc(doc(as(ADMIN), 'users', SUSP_DRIVER), { 'suspension.active': false }));
    await assertFails(updateDoc(doc(as(ADMIN), 'users', SUSP_DRIVER), { isApproved: true, status: 'Activo' }));
    await assertFails(updateDoc(doc(as(ADMIN), 'stores', 'store-s'), { isApproved: true }));
    await assertFails(updateDoc(doc(as(ADMIN), 'users', BUYER), { suspension: { active: true } }));
  });
  it('regresión: el admin sigue aprobando una cuenta pendiente y editando datos de una suspendida', async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'users', PENDING_DRIVER), { isApproved: true, status: 'Activo' }));
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'users', SUSP_DRIVER), { name: 'Corregido por admin' }));
  });
  it('apelaciones: el dueño lee la suya; otro usuario no; el admin sí', async () => {
    await assertSucceeds(getDoc(doc(as(SUSP_DRIVER), 'account_appeals', 'ap-1')));
    await assertFails(getDoc(doc(as(SUSP_OWNER), 'account_appeals', 'ap-1')));
    await assertFails(getDoc(doc(as(BUYER), 'account_appeals', 'ap-1')));
    await assertFails(getDoc(doc(env6.unauthenticatedContext().firestore(), 'account_appeals', 'ap-1')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'account_appeals', 'ap-1')));
  });
  it('apelaciones: nadie las crea, edita ni borra desde el cliente (ni el dueño ni el admin)', async () => {
    await assertFails(setDoc(doc(as(SUSP_DRIVER), 'account_appeals', 'ap-2'), { uid: SUSP_DRIVER, text: 'x'.repeat(40), resolved: false }));
    await assertFails(updateDoc(doc(as(SUSP_DRIVER), 'account_appeals', 'ap-1'), { text: 'cambio mi texto' }));
    await assertFails(updateDoc(doc(as(ADMIN), 'account_appeals', 'ap-1'), { resolved: true, status: 'maintained' }));
    await assertFails(deleteDoc(doc(as(ADMIN), 'account_appeals', 'ap-1')));
  });
  it('el repartidor suspendido NO ve el pool ni se autoasigna un pedido libre', async () => {
    await assertFails(getDoc(doc(as(SUSP_DRIVER), 'orders', 'o-libre')));
    await assertFails(updateDoc(doc(as(SUSP_DRIVER), 'orders', 'o-libre'), { deliveryPersonId: SUSP_DRIVER, status: 'En camino' }));
  });
  it('regresión: el repartidor suspendido TERMINA el pedido que ya llevaba (no se abandona en la calle)', async () => {
    await assertSucceeds(getDoc(doc(as(SUSP_DRIVER), 'orders', 'o-suyo')));
    await assertSucceeds(updateDoc(doc(as(SUSP_DRIVER), 'orders', 'o-suyo'), { status: 'En reparto', pickedUpAt: new Date() }));
  });
});
