// Decoración de temporada (rediseño en vidrio, 9/11/2026). PURO: sin Firestore ni React,
// así lo cargan Vitest, el cliente y (si algún día hace falta) el servidor.
//
// Navidad: la guirnalda de lucecitas y la estrellita del encabezado se prenden solas del
// 8 de diciembre (cuando se arma el arbolito) al 6 de enero (Reyes), en HORA ARGENTINA.
// Sin nieve: acá es verano. El admin puede forzarla desde Ajustes con
// `config/platform.christmasMode` = 'auto' | 'on' | 'off' (sin valor = 'auto').

export type ChristmasMode = 'auto' | 'on' | 'off';

export const CHRISTMAS_MODES: { value: ChristmasMode; label: string }[] = [
  { value: 'auto', label: 'Automática (8/12 al 6/1)' },
  { value: 'on', label: 'Siempre' },
  { value: 'off', label: 'Apagada' },
];

/** Cualquier valor desconocido o ausente cuenta como 'auto'. */
export function normalizeChristmasMode(v: unknown): ChristmasMode {
  return v === 'on' || v === 'off' || v === 'auto' ? v : 'auto';
}

// UTC-3 fijo (Argentina no tiene horario de verano), mismo criterio que el día de
// liquidación y los cierres diarios.
const ART_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * ¿Va la decoración de Navidad en este instante?
 * 'auto' = del 8/12 00:00 al 6/1 23:59:59 hora Argentina (cruza el año: dic O ene).
 */
export function isChristmasActive(nowMs: number, mode: ChristmasMode = 'auto'): boolean {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  const d = new Date(nowMs - ART_OFFSET_MS); // la hora de pared argentina, leída en UTC
  const month = d.getUTCMonth(); // 0 = enero, 11 = diciembre
  const day = d.getUTCDate();
  return (month === 11 && day >= 8) || (month === 0 && day <= 6);
}
