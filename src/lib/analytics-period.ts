import { subDays, startOfMonth, subMonths } from 'date-fns';

// Extraído de my-store/analytics/page.tsx para reusar el mismo cálculo de período +
// comparación en delivery/analytics/page.tsx -- la lógica de "período actual vs
// anterior" tiene que ser idéntica en los dos lados, mejor un solo lugar.

export type Period = '7d' | '30d' | 'month' | 'all';

export const PERIOD_LABELS: Record<Period, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  'month': 'Este mes',
  'all': 'Todo',
};

export function getPeriodBounds(period: Period): { from: Date | null; prevFrom: Date | null; prevTo: Date | null } {
  const now = new Date();
  if (period === 'all') return { from: null, prevFrom: null, prevTo: null };
  if (period === '7d') {
    return { from: subDays(now, 7), prevFrom: subDays(now, 14), prevTo: subDays(now, 7) };
  }
  if (period === '30d') {
    return { from: subDays(now, 30), prevFrom: subDays(now, 60), prevTo: subDays(now, 30) };
  }
  // 'month' = mes calendario actual, vs el MISMO TRAMO del mes pasado (si hoy es 7 de
  // agosto, se compara 1-7 de agosto contra 1-7 de julio). Antes prevTo era el inicio de
  // este mes, o sea el mes pasado COMPLETO: a mitad de mes la comparación siempre daba
  // desplomes falsos (▼94% con 7 días de agosto contra 31 de julio).
  const thisMonthStart = startOfMonth(now);
  const sameDayLastMonth = subMonths(now, 1);
  return { from: thisMonthStart, prevFrom: startOfMonth(sameDayLastMonth), prevTo: sameDayLastMonth };
}

export function pct(current: number, prev: number): { value: number; up: boolean; zero: boolean } {
  const v = ((current - prev) / prev) * 100;
  return { value: Math.abs(v), up: v >= 0, zero: v === 0 };
}
