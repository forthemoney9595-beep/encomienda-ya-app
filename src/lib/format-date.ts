// Formato ÚNICO de fecha/hora para el panel admin (Tanda T1, oct 2026).
// Antes había 11 copias de formatDate/formatDt/fmtDate con formatos distintos entre sí
// (audit-log, claims, finance-view, fichas, orders, payment-issues, reviews...). Todo es-AR
// y en hora ARGENTINA explícita (UTC-3 fijo, sin horario de verano): el admin puede abrir
// el panel desde cualquier zona horaria y los crons de Vercel corren en UTC.
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';

export const ARGENTINA_TZ = 'America/Argentina/Catamarca';

/** Timestamp de Firestore / Date / número / ISO → Date (o null si no se puede). */
export function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts === 'object') {
    const anyTs = ts as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof anyTs.toDate === 'function') return anyTs.toDate();
    const secs = anyTs.seconds ?? anyTs._seconds;
    if (typeof secs === 'number') return new Date(secs * 1000);
  }
  return null;
}

export function toMillis(ts: unknown): number | null {
  const d = toDate(ts);
  return d ? d.getTime() : null;
}

export type DateStyle = 'short' | 'long' | 'time' | 'date' | 'relative';

const FORMATS: Record<Exclude<DateStyle, 'relative'>, Intl.DateTimeFormatOptions> = {
  // 21/10 21:14
  short: { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false },
  // 21 oct 2026, 21:14
  long: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
  // 21:14
  time: { hour: '2-digit', minute: '2-digit', hour12: false },
  // 21/10/2026
  date: { day: '2-digit', month: '2-digit', year: 'numeric' },
};

const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(style: Exclude<DateStyle, 'relative'>): Intl.DateTimeFormat {
  let f = cache.get(style);
  if (!f) {
    f = new Intl.DateTimeFormat('es-AR', { timeZone: ARGENTINA_TZ, ...FORMATS[style] });
    cache.set(style, f);
  }
  return f;
}

/**
 * fmtDate(ts, 'short' | 'long' | 'time' | 'date' | 'relative'). Devuelve '—' si no hay fecha.
 * 'relative' = "hace 3 horas" (date-fns, es).
 */
export function fmtDate(ts: unknown, style: DateStyle = 'short'): string {
  const d = toDate(ts);
  if (!d) return '—';
  if (style === 'relative') {
    try { return formatDistanceToNowStrict(d, { addSuffix: true, locale: es }); } catch { return '—'; }
  }
  // Intl mete una coma entre fecha y hora en 'short' ("21/10, 21:14"); se saca para leer
  // como columna de tabla.
  return formatter(style).format(d).replace(',', '');
}

/**
 * "hace X" compacto y legible a cualquier escala, para columnas de tablas y la Bandeja.
 * Antes solo formateaba horas y minutos, así que un pedido trabado de hace 3 meses
 * mostraba "hace 2261h 14m" (Fase HH). Entrada en milisegundos transcurridos.
 */
export function fmtElapsed(ms: number): string {
  const hours = Math.max(0, ms) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h} h${m > 0 ? ` ${m} m` : ''}`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    const restHours = Math.floor(hours - days * 24);
    return `${days} día${days === 1 ? '' : 's'}${restHours > 0 ? ` ${restHours} h` : ''}`;
  }
  const months = Math.floor(days / 30);
  const restDays = days - months * 30;
  return `${months} mes${months === 1 ? '' : 'es'}${restDays > 0 ? ` ${restDays} d` : ''}`;
}

/** Componentes (año, mes 1-12, día) de una fecha EN HORA ARGENTINA. */
export function argentinaParts(d: Date = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ARGENTINA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/**
 * Inicio del día (00:00) en Argentina, como Date. Argentina es UTC-3 fijo (sin DST), así
 * que "00:00 ART" = 03:00 UTC del mismo día calendario. Para "hoy" en los KPIs del panel:
 * `new Date().setHours(0,0,0,0)` daría el día del navegador, no el del negocio.
 */
export function startOfDayArgentina(d: Date = new Date(), offsetDays = 0): Date {
  const { y, m, d: day } = argentinaParts(d);
  return new Date(Date.UTC(y, m - 1, day + offsetDays, 3, 0, 0, 0));
}

/** Etiqueta corta del día de la semana en es-AR ("lun", "mar"...), en hora Argentina. */
export function weekdayShort(d: Date): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: ARGENTINA_TZ, weekday: 'short' }).format(d).replace('.', '');
}
