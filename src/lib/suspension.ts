// Suspensión de cuentas con debido proceso (Fase YY ter, Tanda C — nov 2026).
//
// Por qué existe: hasta acá un admin desactivaba a un repartidor o revocaba una tienda con un
// click, sin motivo, y la persona no se enteraba de por qué ni podía defenderse. Rappi y
// PedidosYa tuvieron protestas y fallos judiciales en Colombia y Chile justamente por bloqueos
// sin debido proceso (bóveda: "Cómo administran Rappi y PedidosYa", punto 9). El procedimiento
// queda: motivo de una lista cerrada + detalle escrito que lee la persona + duración (hasta
// revisión o N días) + derecho a UNA apelación por suspensión + respuesta escrita.
//
// Este módulo es PURO (sin Firestore ni imports con alias): lo usan el diálogo del admin, el
// aviso del dueño, las rutas de API (Admin SDK) y Vitest. El e2e lo importa directo con el
// type stripping de Node, por eso no importa nada.

export type SuspensionReason =
  | 'documents'
  | 'repeated_claims'
  | 'serious_incidents'
  | 'conduct'
  | 'account_misuse'
  | 'other';

export const SUSPENSION_REASONS: Record<SuspensionReason, { label: string; hint: string }> = {
  documents: {
    label: 'Documentación vencida o falsa',
    hint: 'Licencia, seguro, cédula del vehículo o datos fiscales vencidos, ilegibles o que no coinciden.',
  },
  repeated_claims: {
    label: 'Reclamos reiterados',
    hint: 'Varios reclamos de clientes con fundamento en poco tiempo.',
  },
  serious_incidents: {
    label: 'Incidentes graves con pedidos',
    hint: 'Pedidos perdidos, abandonados o entregados de forma irregular.',
  },
  conduct: {
    label: 'Conducta con clientes o comercios',
    hint: 'Trato agresivo, amenazas, acoso o falta de respeto.',
  },
  account_misuse: {
    label: 'Uso indebido de la cuenta',
    hint: 'Cuenta prestada o compartida, datos falsos, maniobras para cobrar de más.',
  },
  other: {
    label: 'Otro motivo',
    hint: 'Explicalo en el detalle: la persona tiene que entender qué pasó.',
  },
};

export const SUSPENSION_REASON_CODES = Object.keys(SUSPENSION_REASONS) as SuspensionReason[];

/** Duraciones ofrecidas. `null` = hasta que el admin la revise (sin fecha de fin). */
export const SUSPENSION_DURATIONS: (number | null)[] = [null, 7, 15, 30];

export const SUSPENSION_DETAIL_MIN = 20;
export const SUSPENSION_DETAIL_MAX = 1000;
export const APPEAL_TEXT_MIN = 30;
export const APPEAL_TEXT_MAX = 2000;
export const APPEAL_RESPONSE_MIN = 10;

export type SuspendableRole = 'delivery' | 'store';

/** Lo que vive en `users/{uid}.suspension` (lo escribe SOLO el servidor). */
export interface AccountSuspension {
  active: boolean;
  reason: SuspensionReason;
  detail: string;
  /** Timestamp de Firestore (o millis en tests). */
  at: unknown;
  by: string;
  until?: unknown | null;
  durationDays?: number | null;
  role?: SuspendableRole;
  storeId?: string | null;
  appealId?: string | null;
  appealStatus?: 'open' | 'reactivated' | 'maintained' | null;
  liftedAt?: unknown | null;
  liftedBy?: string | null;
  liftCause?: 'appeal' | 'expired' | 'admin' | null;
}

const ARG_TZ = 'America/Argentina/Catamarca';

/** Timestamp de Firestore / Date / número / { seconds } → millis, o null. */
export function suspensionMillis(ts: unknown): number | null {
  if (ts == null) return null;
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : null;
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? null : ts.getTime();
  if (typeof ts === 'object') {
    const t = ts as { toMillis?: () => number; toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.toDate === 'function') return t.toDate().getTime();
    const s = t.seconds ?? t._seconds;
    if (typeof s === 'number') return s * 1000;
  }
  return null;
}

export function isSuspendableRole(role: unknown): role is SuspendableRole {
  return role === 'delivery' || role === 'store';
}

/**
 * Valida lo que manda el admin. Devuelve el mensaje de error (para mostrar o responder 400)
 * o null si está todo bien. La misma función corre en el diálogo y en la ruta.
 */
export function validateSuspensionInput(input: { reason?: unknown; detail?: unknown; durationDays?: unknown }): string | null {
  if (typeof input.reason !== 'string' || !SUSPENSION_REASON_CODES.includes(input.reason as SuspensionReason)) {
    return 'Elegí un motivo de la lista.';
  }
  const detail = typeof input.detail === 'string' ? input.detail.trim() : '';
  if (detail.length < SUSPENSION_DETAIL_MIN) {
    return `El detalle tiene que tener al menos ${SUSPENSION_DETAIL_MIN} caracteres: es lo que va a leer la persona.`;
  }
  if (detail.length > SUSPENSION_DETAIL_MAX) return `El detalle no puede superar ${SUSPENSION_DETAIL_MAX} caracteres.`;
  const d = input.durationDays;
  if (!(d === null || d === undefined || (typeof d === 'number' && SUSPENSION_DURATIONS.includes(d)))) {
    return 'La duración tiene que ser "hasta revisión", 7, 15 o 30 días.';
  }
  return null;
}

export function validateAppealText(text: unknown): string | null {
  const t = typeof text === 'string' ? text.trim() : '';
  if (t.length < APPEAL_TEXT_MIN) return `Contanos tu versión con al menos ${APPEAL_TEXT_MIN} caracteres.`;
  if (t.length > APPEAL_TEXT_MAX) return `La apelación no puede superar ${APPEAL_TEXT_MAX} caracteres.`;
  return null;
}

/** Decisión del admin sobre una apelación. Mantener exige respuesta escrita. */
export function validateAppealDecision(decision: unknown, response: unknown): string | null {
  if (decision !== 'reactivate' && decision !== 'maintain') return 'Decisión inválida.';
  const r = typeof response === 'string' ? response.trim() : '';
  if (decision === 'maintain' && r.length < APPEAL_RESPONSE_MIN) {
    return `Para mantener la suspensión escribí la respuesta (al menos ${APPEAL_RESPONSE_MIN} caracteres): la persona la va a leer.`;
  }
  if (r.length > APPEAL_TEXT_MAX) return 'La respuesta es demasiado larga.';
  return null;
}

/** Fin de la suspensión en millis (null = hasta revisión). */
export function suspensionUntilMs(nowMs: number, durationDays: number | null | undefined): number | null {
  if (!durationDays) return null;
  return nowMs + durationDays * 24 * 3_600_000;
}

/** ¿La suspensión tiene fecha de fin y ya pasó? (El reloj que manda es el del servidor.) */
export function isSuspensionExpired(s: Pick<AccountSuspension, 'active' | 'until'> | null | undefined, nowMs: number): boolean {
  if (!s || s.active !== true) return false;
  const until = suspensionMillis(s.until);
  return until !== null && until <= nowMs;
}

/** Suspensión vigente: activa y sin vencer. */
export function isSuspensionInForce(s: Pick<AccountSuspension, 'active' | 'until'> | null | undefined, nowMs: number): boolean {
  return !!s && s.active === true && !isSuspensionExpired(s, nowMs);
}

/** ¿Puede apelar? Una sola apelación por suspensión, y solo mientras está vigente. */
export function canAppeal(s: Pick<AccountSuspension, 'active' | 'until' | 'appealId'> | null | undefined, nowMs: number): boolean {
  return isSuspensionInForce(s, nowMs) && !s?.appealId;
}

function fmtArg(ms: number): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: ARG_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms));
}

/** "hasta el 14/11/2026, 10:30" o "hasta que la administración la revise". */
export function describeSuspensionEnd(until: unknown): string {
  const ms = suspensionMillis(until);
  return ms === null ? 'hasta que la administración la revise' : `hasta el ${fmtArg(ms)}`;
}

export function reasonLabelOf(reason: unknown): string {
  return SUSPENSION_REASONS[reason as SuspensionReason]?.label ?? 'Otro motivo';
}

/** Texto ÚNICO del aviso a la persona (campanita + push). Lo arma el servidor. */
export function suspensionNoticeBody(opts: { reason: unknown; detail: string; until: unknown; role: SuspendableRole }): string {
  const what = opts.role === 'store' ? 'Tu tienda no recibe pedidos nuevos' : 'No vas a poder tomar pedidos nuevos';
  const where = opts.role === 'store' ? 'Mi Tienda' : 'Mi Panel';
  return `Motivo: ${reasonLabelOf(opts.reason)}. ${opts.detail.trim()} ${what} ${describeSuspensionEnd(opts.until)}. ` +
    `Si no estás de acuerdo, podés apelar una vez desde ${where} → "Apelar", y te respondemos por escrito.`;
}

/** Link del panel del dueño (donde ve el aviso y el botón Apelar). */
export function ownerPanelLink(role: SuspendableRole): string {
  return role === 'store' ? '/my-store' : '/delivery';
}

/** Elige las suspensiones vencidas de una lista (barrido diario). */
export function pickExpiredSuspensions<T extends { id: string; suspension?: Pick<AccountSuspension, 'active' | 'until'> | null }>(
  rows: T[], nowMs: number,
): T[] {
  return rows.filter(r => isSuspensionExpired(r.suspension ?? null, nowMs));
}
