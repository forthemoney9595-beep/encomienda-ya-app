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
