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
