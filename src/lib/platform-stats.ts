import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  platformNetForOrder, storeNetForOrder, driverNetForOrder,
  refundRatio, isPlatformCollected, FALLBACK_COMMISSION, type MoneyOrder,
} from "@/lib/money";
import * as Sentry from "@sentry/nextjs";

// Cierres mensuales de la plataforma (Fase OO ter) — colección `platform_monthly`, un
// doc por mes calendario (id "YYYY-MM") con las ganancias de la app y el reparto de ese
// mes. Es la denormalización que las Fases Y/Z venían evitando hasta que hiciera falta:
// ver "mes a mes, años hacia atrás" no puede bajar el histórico completo de pedidos en
// cada visita — con los cierres, un mes = UNA lectura, para siempre.
//
// Lo mantiene el cron diario de conciliación (no hay un cron nuevo: Vercel Hobby permite
// máximo 2 y ya están usados). Cada corrida:
// - recalcula los últimos RECOMPUTE_MONTHS meses CERRADOS (un reembolso retroactivo
//   cambia el neto de un mes ya cerrado; más atrás que eso se considera congelado)
// - rellena de una sola vez cualquier mes histórico que falte (backfill automático,
//   desde el pedido entregado más viejo)
// El mes EN CURSO no se guarda nunca: cambia todos los días, la UI lo calcula en vivo.
//
// Fórmulas 100% de money.ts — mismo criterio que la tarjeta de ganancias y los retiros.

const RECOMPUTE_MONTHS = 3;

// Meses en hora ARGENTINA (UTC-3 fijo, sin DST): el "1° de agosto" del negocio es el 1°
// de agosto en Tinogasta, no en UTC — mismo problema que el día de liquidación (Fase JJ).
const ART_OFFSET_H = 3;
const artMonthStart = (year: number, month0: number): Date =>
  new Date(Date.UTC(year, month0, 1, ART_OFFSET_H, 0, 0));

const monthIdOf = (year: number, month0: number): string =>
  `${year}-${String(month0 + 1).padStart(2, "0")}`;

function nowInART(): { year: number; month0: number } {
  const art = new Date(Date.now() - ART_OFFSET_H * 3600_000);
  return { year: art.getUTCFullYear(), month0: art.getUTCMonth() };
}

interface MonthBucket {
  platform: number;
  serviceFees: number;
  commissions: number;
  toStores: number;
  toDrivers: number;
  revenue: number;
  orders: number;
}

async function computeMonth(start: Date, end: Date, fallbackRate: number): Promise<MonthBucket> {
  const snap = await adminDb.collection("orders")
    .where("status", "==", "Entregado")
    .where("createdAt", ">=", Timestamp.fromDate(start))
    .where("createdAt", "<", Timestamp.fromDate(end))
    .get();

  const b: MonthBucket = { platform: 0, serviceFees: 0, commissions: 0, toStores: 0, toDrivers: 0, revenue: 0, orders: 0 };
  for (const d of snap.docs) {
    const o = d.data() as MoneyOrder;
    const platform = platformNetForOrder(o, fallbackRate);
    const serviceFee = isPlatformCollected(o) ? (Number(o.serviceFee) || 0) * (1 - refundRatio(o)) : 0;
    b.platform += platform;
    b.serviceFees += serviceFee;
    b.commissions += Math.max(0, platform - serviceFee);
    b.toStores += storeNetForOrder(o, fallbackRate);
    b.toDrivers += driverNetForOrder(o);
    b.revenue += (Number(o.total) || 0);
    b.orders += 1;
  }
  return b;
}

export async function updateMonthlyStats(): Promise<{ updated: string[] }> {
  const updated: string[] = [];
  try {
    let fallbackRate = FALLBACK_COMMISSION;
    try {
      const cfg = await adminDb.collection("config").doc("platform").get();
      const v = Number(cfg.data()?.defaultCommissionRate);
      if (Number.isFinite(v) && v > 0) fallbackRate = v;
    } catch { /* default */ }

    // Desde el pedido entregado más viejo hasta el último mes CERRADO.
    const oldestSnap = await adminDb.collection("orders")
      .where("status", "==", "Entregado")
      .orderBy("createdAt", "asc")
      .limit(1)
      .get();
    if (oldestSnap.empty) return { updated };
    const oldest = oldestSnap.docs[0].data().createdAt?.toDate?.() as Date | undefined;
    if (!oldest) return { updated };

    const oldestArt = new Date(oldest.getTime() - ART_OFFSET_H * 3600_000);
    let y = oldestArt.getUTCFullYear();
    let m = oldestArt.getUTCMonth();
    const current = nowInART();

    const existing = new Set<string>();
    (await adminDb.collection("platform_monthly").select().get()).docs.forEach(d => existing.add(d.id));

    while (y < current.year || (y === current.year && m < current.month0)) {
      const id = monthIdOf(y, m);
      // Los últimos N meses cerrados se recalculan siempre; los más viejos solo si faltan.
      const monthsBack = (current.year - y) * 12 + (current.month0 - m);
      const isRecent = monthsBack <= RECOMPUTE_MONTHS;

      if (isRecent || !existing.has(id)) {
        const start = artMonthStart(y, m);
        const end = artMonthStart(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1);
        const bucket = await computeMonth(start, end, fallbackRate);
        await adminDb.collection("platform_monthly").doc(id).set({
          // `ym` duplica el id como CAMPO a propósito: la UI ordena por acá
          // (orderBy('ym','desc') = índice automático). Ordenar por documentId()
          // DESCENDENTE no es automático en Firestore y exigía un índice manual —
          // falló en vivo con failed-precondition al probar la primera versión.
          ym: id,
          year: y,
          month: m + 1,
          ...Object.fromEntries(Object.entries(bucket).map(([k, v]) => [k, Math.round(v)])),
          computedAt: Timestamp.now(),
        });
        updated.push(id);
      }

      m += 1;
      if (m === 12) { m = 0; y += 1; }
    }
  } catch (e) {
    console.error("[platform-stats] Error actualizando cierres mensuales:", e);
    Sentry.captureException(e, { tags: { area: "platform-stats" } });
  }
  return { updated };
}
