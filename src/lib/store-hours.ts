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

// ── Horario especial por fecha (nov 2026: fiestas — 24/12, 25/12, 31/12) ──────────────
// `stores/{id}.specialHours` = { 'YYYY-MM-DD': { closed, ranges } }, opcional. Si hay una
// entrada para la fecha de HOY, esa entrada MANDA sobre el horario semanal ese día (también
// para la franja nocturna que sigue pasada la medianoche: la de "ayer" se busca primero en
// specialHours de ayer). Sin el campo, todo funciona exactamente igual que antes.
//
// La fecha se lee con los MISMOS campos de pared que ya usa getStoreOpenStatus
// (getFullYear/getMonth/getDate, como getDay/getHours): en el cliente es la hora local del
// navegador y en el server hay que pasar nowInArgentina(). Así "hoy" es el mismo día para
// el horario semanal y para el especial.
export type SpecialDay = DaySchedule;
export type SpecialHours = Record<string, SpecialDay>;

/** Lo que devuelve normalizeSchedule: el semanal de siempre, con el horario especial colgado
 *  si la tienda tiene. `alwaysOpen` = la tienda no tiene horario semanal (antes null =
 *  "siempre abierta") pero sí fechas especiales: los 7 días van 00:00-24:00. */
export type NormalizedSchedule = WeeklySchedule & { specialHours?: SpecialHours; alwaysOpen?: boolean };

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' con los campos de pared de `d` (ver criterio arriba). */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Mismo día de pared corrido `n` días (n negativo = para atrás). */
export function addDaysWall(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}

export function isValidDateKey(k: string): boolean {
  if (!DATE_KEY_RE.test(k)) return false;
  const [y, m, d] = k.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Limpia el mapa crudo de Firestore: solo claves de fecha válidas y franjas con forma. */
export function normalizeSpecialHours(raw: unknown): SpecialHours | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: SpecialHours = {};
  for (const [k, v] of Object.entries(raw as Record<string, any>)) {
    if (!isValidDateKey(k) || !v || typeof v !== 'object') continue;
    const ranges: TimeRange[] = Array.isArray(v.ranges)
      ? v.ranges.filter((r: any) => typeof r?.open === 'string' && typeof r?.close === 'string' && r.open && r.close)
          .map((r: any) => ({ open: r.open, close: r.close }))
      : [];
    // Un día "abierto" sin ninguna franja no abre nunca: se trata como cerrado.
    out[k] = { closed: !!v.closed || ranges.length === 0, ranges: v.closed ? [] : ranges };
  }
  return Object.keys(out).length ? out : null;
}

// Solo el horario SEMANAL (formato nuevo o el viejo {open,close}), sin fechas especiales.
// Es lo que tiene que cargar el editor semanal de /my-store/edit.
export function normalizeWeeklySchedule(store: any): WeeklySchedule | null {
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

// Acepta el formato nuevo (store.weeklySchedule) o el viejo (store.schedule = {open, close}
// aplicado a todos los días). Devuelve null cuando no hay horario configurado, lo que el
// resto del código interpreta como "siempre abierta" (comportamiento previo).
// Si la tienda tiene `specialHours` vigentes, el resultado los lleva colgados
// (`schedule.specialHours`) para que getStoreOpenStatus los aplique SIN tocar a los llamadores
// (todos hacen getStoreOpenStatus(normalizeSchedule(store))). Las fechas de hace más de 2 días
// se ignoran acá (margen para el desfase UTC del server y la franja nocturna de ayer): una
// tienda con solo fechas viejas se comporta idéntico a una sin el campo.
export function normalizeSchedule(store: any, now: Date = new Date()): NormalizedSchedule | null {
  const weekly = normalizeWeeklySchedule(store);
  const special = normalizeSpecialHours(store?.specialHours);
  if (!special) return weekly;
  const cutoff = dateKey(addDaysWall(now, -2));
  const live: SpecialHours = {};
  for (const [k, v] of Object.entries(special)) if (k >= cutoff) live[k] = v;
  if (!Object.keys(live).length) return weekly;
  const base: NormalizedSchedule = weekly
    ? [...weekly]
    : Object.assign(
        Array.from({ length: 7 }, () => ({ closed: false, ranges: [{ open: '00:00', close: '24:00' }] })),
        { alwaysOpen: true },
      );
  base.specialHours = live;
  return base;
}

export type OpenStatus = {
  isOpen: boolean;
  label: 'Abierto' | 'Cerrado';
  todayRanges: TimeRange[];
  closedToday: boolean;
  /** Hoy rige un horario especial por fecha (fiestas), no el semanal. */
  isSpecialToday: boolean;
  /** Si está abierta: hora 'HH:MM' en que cierra la franja actual (null si no aplica). */
  closesAt: string | null;
};

// `now` se pasa explícito: en el cliente es la hora local del navegador (= hora AR para los
// usuarios de Tinogasta); en el server hay que pasar nowInArgentina() porque el reloj está en UTC.
export function getStoreOpenStatus(schedule: NormalizedSchedule | WeeklySchedule | null, now: Date = new Date()): OpenStatus {
  if (!schedule) return { isOpen: true, label: 'Abierto', todayRanges: [], closedToday: false, isSpecialToday: false, closesAt: null };

  const special = (schedule as NormalizedSchedule).specialHours;
  const alwaysOpen = !!(schedule as NormalizedSchedule).alwaysOpen;
  const todaySpecial = special?.[dateKey(now)];
  const yesterdaySpecial = special?.[dateKey(addDaysWall(now, -1))];

  // Tienda sin horario semanal y hoy sin fecha especial: "siempre abierta", igual que antes.
  // (La franja nocturna de una fecha especial de ayer no cambia nada: ya está abierta.)
  if (alwaysOpen && !todaySpecial) {
    return { isOpen: true, label: 'Abierto', todayRanges: [], closedToday: false, isSpecialToday: false, closesAt: null };
  }

  const day = now.getDay();
  const prev = (day + 6) % 7;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = todaySpecial ?? schedule[day];
  const yesterday = yesterdaySpecial ?? (alwaysOpen ? undefined : schedule[prev]);

  let isOpen = false;
  let closesAt: string | null = null;

  if (today && !today.closed) {
    for (const r of today.ranges) {
      const o = toMin(r.open), c = toMin(r.close);
      if (c > o) {
        if (nowMin >= o && nowMin < c) { isOpen = true; closesAt = r.close; }
      } else if (c < o) {
        // Franja nocturna (ej: 20:00-02:00): la parte de hoy va de open a medianoche.
        if (nowMin >= o) { isOpen = true; closesAt = r.close; }
      }
    }
  }
  // Franja nocturna de ayer que sigue abierta pasada la medianoche.
  if (!isOpen && yesterday && !yesterday.closed) {
    for (const r of yesterday.ranges) {
      const o = toMin(r.open), c = toMin(r.close);
      if (c < o && nowMin < c) { isOpen = true; closesAt = r.close; }
    }
  }

  return {
    isOpen,
    label: isOpen ? 'Abierto' : 'Cerrado',
    todayRanges: today && !today.closed ? today.ranges : [],
    closedToday: !today || today.closed,
    isSpecialToday: !!todaySpecial,
    closesAt: isOpen ? closesAt : null,
  };
}

// ── Próximas fechas especiales (para la tienda pública y el dashboard) ────────────────
export type UpcomingSpecialDay = {
  date: string;        // 'YYYY-MM-DD'
  label: string;       // '24/12'
  closed: boolean;
  ranges: TimeRange[];
  isToday: boolean;
};

/** Fechas especiales desde HOY hasta hoy + `days - 1` (inclusive), ordenadas. `now` con el
 *  mismo criterio de pared que getStoreOpenStatus. */
export function upcomingSpecialDays(store: any, now: Date = new Date(), days = 14): UpcomingSpecialDay[] {
  const special = normalizeSpecialHours(store?.specialHours);
  if (!special || days <= 0) return [];
  const from = dateKey(now);
  const to = dateKey(addDaysWall(now, days - 1));
  return Object.keys(special)
    .filter(k => k >= from && k <= to)
    .sort()
    .map(k => {
      const v = special[k];
      const [, m, d] = k.split('-');
      return { date: k, label: `${Number(d)}/${Number(m)}`, closed: v.closed, ranges: v.closed ? [] : v.ranges, isToday: k === from };
    });
}

/** '09:00' → '9', '20:30' → '20:30' (como lo dice la gente: "de 9 a 20"). */
export function formatHourShort(t: string): string {
  const [h, m] = (t || '').split(':');
  const hh = String(Number(h) || 0);
  return !m || m === '00' ? hh : `${hh}:${m}`;
}

/** '24/12 de 9 a 20' · '24/12 de 9 a 13 y de 17 a 20' · '25/12 cerrado'. */
export function formatSpecialDay(d: Pick<UpcomingSpecialDay, 'label' | 'closed' | 'ranges'>): string {
  if (d.closed || d.ranges.length === 0) return `${d.label} cerrado`;
  return `${d.label} ${d.ranges.map(r => `de ${formatHourShort(r.open)} a ${formatHourShort(r.close)}`).join(' y ')}`;
}

/** Línea lista para mostrar: "24/12 de 9 a 20 · 25/12 cerrado" ('' si no hay ninguna). */
export function describeUpcomingSpecialDays(store: any, now: Date = new Date(), days = 14): string {
  return upcomingSpecialDays(store, now, days).map(formatSpecialDay).join(' · ');
}

// ── Validación y limpieza (editor de /my-store/edit) ──────────────────────────────────
export type SpecialDayDraft = { date: string; closed: boolean; ranges: TimeRange[] };

/** Mismo criterio que el editor semanal (apertura < cierre, sin franjas nocturnas), más:
 *  fecha válida, no pasada, sin repetir. Devuelve el primer error o null. */
export function validateSpecialDays(list: SpecialDayDraft[], todayKey: string): string | null {
  const seen = new Set<string>();
  for (const d of list) {
    if (!d.date || !isValidDateKey(d.date)) return 'Elegí la fecha de cada horario especial.';
    const label = d.date.split('-').reverse().slice(0, 2).map(Number).join('/');
    if (d.date < todayKey) return `La fecha ${label} ya pasó: quitala o elegí otra.`;
    if (seen.has(d.date)) return `La fecha ${label} está cargada dos veces.`;
    seen.add(d.date);
    if (d.closed) continue;
    if (d.ranges.length === 0) return `El ${label} figura abierto pero no tiene franjas: agregá una o marcalo cerrado.`;
    for (const r of d.ranges) {
      if (!TIME_RE.test(r.open) || !TIME_RE.test(r.close) || r.open >= r.close) {
        return `El ${label}, la franja ${r.open || '—'} → ${r.close || '—'} no sirve: la hora de cierre tiene que ser posterior a la de apertura.`;
      }
    }
  }
  return null;
}

/** Arma el mapa a guardar: sin fechas pasadas, ordenado por fecha. */
export function buildSpecialHours(list: SpecialDayDraft[], todayKey: string): SpecialHours {
  const out: SpecialHours = {};
  for (const d of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!isValidDateKey(d.date) || d.date < todayKey) continue;
    out[d.date] = d.closed ? { closed: true, ranges: [] } : { closed: false, ranges: d.ranges.map(r => ({ open: r.open, close: r.close })) };
  }
  return out;
}

/** ¿La tienda ya cargó el 24/12 o el 31/12 del año de `now`? (tarjeta de fiestas) */
export function holidayKeys(now: Date): { christmasEve: string; newYearsEve: string } {
  const y = now.getFullYear();
  return { christmasEve: `${y}-12-24`, newYearsEve: `${y}-12-31` };
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
// Si hoy rige un horario especial por fecha, describe ESE (con la aclaración).
export function describeSchedule(store: any, now: Date = new Date()): string {
  const s = normalizeSchedule(store, now);
  if (!s) return 'Siempre abierta';
  const special = s.specialHours?.[dateKey(now)];
  if (special) {
    if (special.closed) return 'Hoy cerrado (horario especial)';
    return `Hoy ${formatRanges(special.ranges)} (horario especial)`;
  }
  if (s.alwaysOpen) return 'Siempre abierta';
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
