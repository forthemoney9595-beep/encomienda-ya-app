// Recordatorio y cancelación automática de pedidos sin confirmar (Fase YY, Tanda A —
// punto 5 de "Cómo administran Rappi y PedidosYa").
//
// Parte PURA (sin Firestore): la importan el servidor (`confirm-timeout-server.ts`, la ruta
// `/api/orders/confirm-timeout` y el barrido del cron), la pantalla de ajustes del admin y
// los tests. La aplicación con Admin SDK vive aparte a propósito: si este archivo importara
// `firebase-admin`, el cliente no podría usar los defaults/rangos ni los tests podrían
// cargarlo sin credenciales.
//
// 🕐 Por qué no hay un cron por minuto: Vercel Hobby permite 2 crons y son DIARIOS (ya
// usados por conciliación y liquidación). El reloj lo dan los clientes que están mirando el
// pedido (detalle del comprador, panel de la tienda, Bandeja del admin): cada uno programa
// timers y llama a la ruta, que decide con SU reloj y el `createdAt` del pedido. La ruta es
// idempotente, así que tres clientes disparando a la vez no hacen nada dos veces. El cron
// diario de conciliación es la red de seguridad para los que nadie estaba mirando. **Con
// Vercel Pro, un cron por minuto que llame a `sweepUnconfirmedOrders()` reemplaza a los
// disparadores de cliente** (se pueden dejar: son inofensivos).

/** Defaults y rangos de `config/platform.confirmReminderMinutes` / `confirmTimeoutMinutes`. */
export const CONFIRM_DEFAULTS = { reminderMinutes: 5, timeoutMinutes: 15 } as const;
export const CONFIRM_RANGES = {
  confirmReminderMinutes: { min: 2, max: 30, label: 'Recordatorio a la tienda (min)' },
  confirmTimeoutMinutes: { min: 5, max: 60, label: 'Cancelación automática (min)' },
} as const;

export const PENDING_CONFIRMATION = 'Pendiente de Confirmación';

/** Motivo de cancelación que escribe el sistema. Se rotula "No confirmado a tiempo". */
export const AUTO_UNCONFIRMED = 'auto_unconfirmed';

export type ConfirmConfig = { reminderMinutes: number; timeoutMinutes: number };

const MIN = 60_000;

/**
 * Lee la config de la plataforma y la deja SIEMPRE usable: valores fuera de rango o
 * inválidos caen al default, y si el timeout no supera al recordatorio se usan los dos
 * defaults (la pantalla de ajustes ya lo impide; esto es la defensa del servidor).
 */
export function resolveConfirmConfig(platform: Record<string, unknown> | null | undefined): ConfirmConfig {
  const pick = (v: unknown, r: { min: number; max: number }, fb: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= r.min && v <= r.max ? v : fb;
  const reminderMinutes = pick(platform?.confirmReminderMinutes, CONFIRM_RANGES.confirmReminderMinutes, CONFIRM_DEFAULTS.reminderMinutes);
  const timeoutMinutes = pick(platform?.confirmTimeoutMinutes, CONFIRM_RANGES.confirmTimeoutMinutes, CONFIRM_DEFAULTS.timeoutMinutes);
  if (timeoutMinutes <= reminderMinutes) return { ...CONFIRM_DEFAULTS };
  return { reminderMinutes, timeoutMinutes };
}

/** Validación para /admin/settings: null = OK, string = mensaje para el admin. */
export function confirmConfigError(cfg: { confirmReminderMinutes?: unknown; confirmTimeoutMinutes?: unknown }): string | null {
  const r = cfg.confirmReminderMinutes ?? CONFIRM_DEFAULTS.reminderMinutes;
  const t = cfg.confirmTimeoutMinutes ?? CONFIRM_DEFAULTS.timeoutMinutes;
  for (const [key, v] of [['confirmReminderMinutes', r], ['confirmTimeoutMinutes', t]] as const) {
    const range = CONFIRM_RANGES[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `${range.label}: el campo está vacío o no es un número.`;
    if (v < range.min || v > range.max) return `${range.label}: tiene que estar entre ${range.min} y ${range.max} (pusiste ${v}).`;
  }
  if ((t as number) <= (r as number)) return 'La cancelación automática tiene que ser DESPUÉS del recordatorio a la tienda.';
  return null;
}

export type ConfirmAction = 'none' | 'remind' | 'cancel';

export interface ConfirmDecisionInput {
  status: string | undefined;
  /** createdAt del pedido en ms. null = pedido sin fecha (no se decide nada). */
  createdAtMs: number | null;
  /** confirmReminderSentAt en ms, o null si nunca se mandó. */
  reminderSentAtMs: number | null;
  nowMs: number;
  config: ConfirmConfig;
}

export interface ConfirmDecision {
  action: ConfirmAction;
  /** Momento del recordatorio y de la cancelación (ms). null si no aplica. */
  reminderAt: number | null;
  timeoutAt: number | null;
}

/**
 * Decide qué corresponde hacerle a un pedido AHORA. Pura: el servidor la llama con su reloj
 * dentro de una transacción (y re-lee el pedido en cada reintento), así que el resultado
 * nunca depende del reloj del navegador que disparó la ruta.
 *
 * - Pedido que ya no está 'Pendiente de Confirmación' → none (confirmado, rechazado,
 *   cancelado: la carrera confirmar-vs-cancelar la resuelve la transacción).
 * - Pasó el timeout → cancel (aunque el recordatorio no haya salido: no tiene sentido
 *   recordar algo que se cancela en el mismo instante).
 * - Pasó el recordatorio y nunca se mandó → remind (una sola vez).
 */
export function decideConfirmTimeout(input: ConfirmDecisionInput): ConfirmDecision {
  const { status, createdAtMs, reminderSentAtMs, nowMs, config } = input;
  if (createdAtMs === null || !Number.isFinite(createdAtMs)) return { action: 'none', reminderAt: null, timeoutAt: null };
  const reminderAt = createdAtMs + config.reminderMinutes * MIN;
  const timeoutAt = createdAtMs + config.timeoutMinutes * MIN;
  if (status !== PENDING_CONFIRMATION) return { action: 'none', reminderAt, timeoutAt };
  if (nowMs >= timeoutAt) return { action: 'cancel', reminderAt, timeoutAt };
  if (nowMs >= reminderAt && reminderSentAtMs === null) return { action: 'remind', reminderAt, timeoutAt };
  return { action: 'none', reminderAt, timeoutAt };
}

/**
 * Cómo terminó un pedido cancelado o rechazado, en criollo. Único lugar del rótulo: lo usan
 * el detalle del pedido, el panel de la tienda y `/admin/orders` (antes cada pantalla decía
 * solo "Cancelado" y nadie sabía quién ni por qué).
 */
export function describeOrderEnding(o: {
  status?: string; cancelReason?: string | null; cancelledBy?: string | null; rejectionReason?: string | null;
}): { label: string; detail?: string } | null {
  if (o.status === 'Rechazado') {
    return { label: 'Rechazado por la tienda', detail: o.rejectionReason || undefined };
  }
  if (o.status !== 'Cancelado') return null;
  if (o.cancelReason === AUTO_UNCONFIRMED) {
    return { label: 'No confirmado a tiempo', detail: 'La tienda no confirmó el pedido en el plazo. No se cobró nada.' };
  }
  const who = o.cancelledBy === 'admin' ? 'Cancelado por la administración'
    : o.cancelledBy === 'buyer' ? 'Cancelado por el cliente'
    : o.cancelledBy === 'system' ? 'Cancelado por el sistema'
    : 'Cancelado';
  return { label: who, detail: o.cancelReason || undefined };
}
