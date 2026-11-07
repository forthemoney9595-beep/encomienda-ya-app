/**
 * Calendario de cobro de tiendas y repartidores (Fase YY bis, puntos 1 y 2 de la nota de
 * Rappi/PedidosYa). PURO: lo usan las billeteras y sus tests.
 *
 * Cómo se cobra hoy: el cron `/api/cron/generate-settlements` corre todos los días a las
 * 14:00 UTC (11:00 en Argentina) y, el día de `config/platform.settlementDayOfWeek` (default
 * viernes), genera una SOLICITUD de pago por el saldo completo de cada cuenta con CBU
 * cargado. El pago se acredita recién cuando el admin la aprueba y transfiere (principio
 * "el dinero nunca sale solo").
 *
 * Semanas: de LUNES 00:00 a DOMINGO 23:59 en hora argentina (UTC-3 fijo, sin horario de
 * verano — mismo criterio que platform-daily).
 */
import { addDaysId, dayIdART, dayStartART } from './platform-daily';

/** Hora (Argentina) a la que el cron genera las liquidaciones: 14:00 UTC = 11:00 ART. */
export const SETTLEMENT_CRON_HOUR_ART = 11;
/** Default del cron si `config/platform.settlementDayOfWeek` no está (viernes). */
export const DEFAULT_SETTLEMENT_DOW = 5;

export const DOW_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

export function normalizeSettlementDow(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : DEFAULT_SETTLEMENT_DOW;
}

/**
 * Próximo día de liquidación. `nowWall` es la hora de PARED argentina (lo que devuelve
 * `nowInArgentina()`: sus getDay/getHours son los de Tinogasta). Si hoy es el día y todavía
 * no pasó la hora del cron, la próxima es hoy.
 */
export function nextSettlement(nowWall: Date, settlementDow: unknown): { date: Date; label: string; isToday: boolean; daysAhead: number } {
  const dow = normalizeSettlementDow(settlementDow);
  let daysAhead = (dow - nowWall.getDay() + 7) % 7;
  if (daysAhead === 0 && nowWall.getHours() >= SETTLEMENT_CRON_HOUR_ART) daysAhead = 7;
  const date = new Date(nowWall.getFullYear(), nowWall.getMonth(), nowWall.getDate() + daysAhead, SETTLEMENT_CRON_HOUR_ART, 0, 0);
  return {
    date,
    label: `${DOW_NAMES[dow]} ${date.getDate()}/${date.getMonth() + 1}`,
    isToday: daysAhead === 0,
    daysAhead,
  };
}

export interface WeekBounds {
  /** Lunes 00:00 ART (inclusivo) y lunes siguiente 00:00 ART (exclusivo), en ms. */
  fromMs: number;
  toMs: number;
  /** Ids de día ART del lunes y del domingo ("YYYY-MM-DD"). */
  mondayId: string;
  sundayId: string;
  /** "lun 3/11 – dom 9/11". */
  label: string;
}

const shortDay = (id: string) => {
  const [, m, d] = id.split('-').map(Number);
  return `${d}/${m}`;
};

/** Semana lunes→domingo (ART) que contiene `nowMs`, corrida `offsetWeeks` (−1 = la pasada). */
export function weekBoundsART(nowMs: number, offsetWeeks = 0): WeekBounds {
  const todayId = dayIdART(nowMs);
  const [y, m, d] = todayId.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  const mondayId = addDaysId(todayId, -((dow + 6) % 7) + 7 * offsetWeeks);
  const sundayId = addDaysId(mondayId, 6);
  return {
    fromMs: dayStartART(mondayId).getTime(),
    toMs: dayStartART(addDaysId(mondayId, 7)).getTime(),
    mondayId,
    sundayId,
    label: `lun ${shortDay(mondayId)} – dom ${shortDay(sundayId)}`,
  };
}

/** Mes calendario ART que contiene `nowMs`, corrido `offsetMonths`. */
export function monthBoundsART(nowMs: number, offsetMonths = 0): { fromMs: number; toMs: number } {
  const [y, m] = dayIdART(nowMs).split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offsetMonths, 1));
  const next = new Date(Date.UTC(y, m + offsetMonths, 1));
  const id = (dt: Date) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return { fromMs: dayStartART(id(first)).getTime(), toMs: dayStartART(id(next)).getTime() };
}
