// Helper compartido de horarios de tienda. Fuente de verdad única para "¿está abierta?"
// usada por la tienda pública, el dashboard de tienda, las vistas de admin y el server
// (/api/orders/create). Antes la lógica de apertura vivía duplicada e inline en la tienda
// pública y solo soportaba un único par apertura/cierre para todos los días.

export type TimeRange = { open: string; close: string };
export type DaySchedule = { closed: boolean; ranges: TimeRange[] };
// length 7, índice 0 = Domingo ... 6 = Sábado (coincide con Date.getDay()).
export type WeeklySchedule = DaySchedule[];

export const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Orden de visualización (lunes primero, como espera la gente).
export const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const toMin = (t: string) => {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function defaultWeeklySchedule(): WeeklySchedule {
  return Array.from({ length: 7 }, () => ({ closed: false, ranges: [{ open: '09:00', close: '22:00' }] }));
}

// Acepta el formato nuevo (store.weeklySchedule) o el viejo (store.schedule = {open, close}
// aplicado a todos los días). Devuelve null cuando no hay horario configurado, lo que el
// resto del código interpreta como "siempre abierta" (comportamiento previo).
export function normalizeSchedule(store: any): WeeklySchedule | null {
  const w = store?.weeklySchedule;
  if (Array.isArray(w) && w.length === 7) {
    return w.map((d: any) => ({
      closed: !!d?.closed,
      ranges: Array.isArray(d?.ranges) ? d.ranges.filter((r: any) => r?.open && r?.close) : [],
    }));
  }
  const legacy = store?.schedule;
  if (legacy?.open && legacy?.close) {
    return Array.from({ length: 7 }, () => ({ closed: false, ranges: [{ open: legacy.open, close: legacy.close }] }));
  }
  return null;
}

export type OpenStatus = {
  isOpen: boolean;
  label: 'Abierto' | 'Cerrado';
  todayRanges: TimeRange[];
  closedToday: boolean;
};

// `now` se pasa explícito: en el cliente es la hora local del navegador (= hora AR para los
// usuarios de Tinogasta); en el server hay que pasar nowInArgentina() porque el reloj está en UTC.
export function getStoreOpenStatus(schedule: WeeklySchedule | null, now: Date = new Date()): OpenStatus {
  if (!schedule) return { isOpen: true, label: 'Abierto', todayRanges: [], closedToday: false };

  const day = now.getDay();
  const prev = (day + 6) % 7;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = schedule[day];
  const yesterday = schedule[prev];

  let isOpen = false;

  if (today && !today.closed) {
    for (const r of today.ranges) {
      const o = toMin(r.open), c = toMin(r.close);
      if (c > o) {
        if (nowMin >= o && nowMin < c) isOpen = true;
      } else if (c < o) {
        // Franja nocturna (ej: 20:00-02:00): la parte de hoy va de open a medianoche.
        if (nowMin >= o) isOpen = true;
      }
    }
  }
  // Franja nocturna de ayer que sigue abierta pasada la medianoche.
  if (!isOpen && yesterday && !yesterday.closed) {
    for (const r of yesterday.ranges) {
      const o = toMin(r.open), c = toMin(r.close);
      if (c < o && nowMin < c) isOpen = true;
    }
  }

  return {
    isOpen,
    label: isOpen ? 'Abierto' : 'Cerrado',
    todayRanges: today && !today.closed ? today.ranges : [],
    closedToday: !today || today.closed,
  };
}

export function formatRanges(ranges: TimeRange[]): string {
  if (!ranges || ranges.length === 0) return 'Cerrado';
  return ranges.map(r => `${r.open}-${r.close}`).join(', ');
}

// Hora de pared en Argentina, para uso server-side (Vercel corre en UTC). Sólo se leen los
// campos wall-clock (getDay/getHours/getMinutes), así que el offset de zona ya queda aplicado.
export function nowInArgentina(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
}

// Resumen corto para vistas de admin ("Hoy 09:00-13:00, 17:00-21:00" / "Hoy cerrado").
export function describeSchedule(store: any, now: Date = new Date()): string {
  const s = normalizeSchedule(store);
  if (!s) return 'Siempre abierta';
  const today = s[now.getDay()];
  if (!today || today.closed) return 'Hoy cerrado';
  return `Hoy ${formatRanges(today.ranges)}`;
}

// ── Pausa manual con tiempo (Fase YY, punto 6) ─────────────────────────────────────────
// `stores/{id}.manuallyPaused` era un switch y la gente se olvidaba la tienda pausada. Ahora
// puede llevar `pausedUntil` (timestamp): pasada esa hora la tienda vuelve SOLA, sin que
// nadie escriba nada (el doc puede quedar con manuallyPaused:true y un pausedUntil vencido —
// por eso NINGÚN lector mira `manuallyPaused` a secas: todos pasan por acá, igual que
// "¿abierta?" pasa siempre por getStoreOpenStatus).
//
// ⚠️ `now` es un instante REAL (Date.now() / new Date()), NO nowInArgentina(): esa función
// devuelve un Date corrido para leer la hora de pared y compararlo contra un timestamp
// absoluto daría la pausa 3 horas corrida.
type PausableStore = { manuallyPaused?: boolean; pausedUntil?: unknown } | null | undefined;

/** pausedUntil en ms epoch (acepta Timestamp de cliente o Admin, Date, número o ISO). */
export function pausedUntilMs(store: PausableStore): number | null {
  const v = store?.pausedUntil as any;
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
  if (typeof v?.toMillis === 'function') return v.toMillis();
  const secs = v?.seconds ?? v?._seconds;
  return typeof secs === 'number' ? secs * 1000 : null;
}

/** Pausa efectiva = manuallyPaused && (sin pausedUntil || pausedUntil todavía no llegó). */
export function isStorePaused(store: PausableStore, now: Date | number = Date.now()): boolean {
  if (!store?.manuallyPaused) return false;
  const until = pausedUntilMs(store);
  if (until === null) return true;
  const nowMs = typeof now === 'number' ? now : now.getTime();
  return until > nowMs;
}
