import { describe, it, expect } from 'vitest';
import {
  validateSuspensionInput, validateAppealText, validateAppealDecision, suspensionUntilMs,
  isSuspensionExpired, isSuspensionInForce, canAppeal, describeSuspensionEnd, suspensionNoticeBody,
  pickExpiredSuspensions, suspensionMillis, SUSPENSION_DETAIL_MIN, APPEAL_TEXT_MIN, ownerPanelLink,
} from './suspension';

const DAY = 24 * 3_600_000;
const NOW = Date.UTC(2026, 10, 7, 15, 0, 0); // 7/11/2026 12:00 ART
const detail = 'Tres clientes reportaron pedidos sin entregar esta semana.';

describe('validateSuspensionInput', () => {
  it('acepta motivo de la lista + detalle largo + duración ofrecida', () => {
    expect(validateSuspensionInput({ reason: 'conduct', detail, durationDays: 7 })).toBeNull();
    expect(validateSuspensionInput({ reason: 'documents', detail, durationDays: null })).toBeNull();
    expect(validateSuspensionInput({ reason: 'other', detail })).toBeNull();
  });
  it('rechaza motivo fuera de la lista o ausente', () => {
    expect(validateSuspensionInput({ reason: 'porque si', detail, durationDays: 7 })).toMatch(/motivo/);
    expect(validateSuspensionInput({ detail, durationDays: 7 })).toMatch(/motivo/);
  });
  it(`rechaza detalle de menos de ${SUSPENSION_DETAIL_MIN} caracteres (contando sin espacios de los bordes)`, () => {
    expect(validateSuspensionInput({ reason: 'conduct', detail: 'muy corto', durationDays: 7 })).toMatch(/al menos/);
    expect(validateSuspensionInput({ reason: 'conduct', detail: '   ' + 'x'.repeat(SUSPENSION_DETAIL_MIN - 1) + '   ' })).toMatch(/al menos/);
    expect(validateSuspensionInput({ reason: 'conduct', detail: 'x'.repeat(SUSPENSION_DETAIL_MIN) })).toBeNull();
  });
  it('rechaza duraciones no ofrecidas', () => {
    expect(validateSuspensionInput({ reason: 'conduct', detail, durationDays: 3 })).toMatch(/duración/);
    expect(validateSuspensionInput({ reason: 'conduct', detail, durationDays: '7' })).toMatch(/duración/);
  });
});

describe('apelación', () => {
  it(`exige al menos ${APPEAL_TEXT_MIN} caracteres`, () => {
    expect(validateAppealText('no fui yo')).toMatch(/al menos/);
    expect(validateAppealText('x'.repeat(APPEAL_TEXT_MIN))).toBeNull();
    expect(validateAppealText(undefined)).toMatch(/al menos/);
  });
  it('mantener exige respuesta escrita; reactivar no', () => {
    expect(validateAppealDecision('maintain', '')).toMatch(/respuesta/);
    expect(validateAppealDecision('maintain', 'Revisamos los reclamos y se confirman.')).toBeNull();
    expect(validateAppealDecision('reactivate', '')).toBeNull();
    expect(validateAppealDecision('borrar', 'x')).toMatch(/inválida/);
  });
});

describe('vencimiento', () => {
  it('hasta revisión no tiene fin; N días suma N días', () => {
    expect(suspensionUntilMs(NOW, null)).toBeNull();
    expect(suspensionUntilMs(NOW, 7)).toBe(NOW + 7 * DAY);
  });
  it('vence recién cuando until <= ahora (decide el reloj que se le pase)', () => {
    const s = { active: true, until: NOW + DAY };
    expect(isSuspensionExpired(s, NOW)).toBe(false);
    expect(isSuspensionInForce(s, NOW)).toBe(true);
    expect(isSuspensionExpired(s, NOW + DAY)).toBe(true);
    expect(isSuspensionInForce(s, NOW + DAY + 1)).toBe(false);
  });
  it('una suspensión hasta revisión nunca vence sola; una levantada no cuenta', () => {
    expect(isSuspensionExpired({ active: true, until: null }, NOW + 365 * DAY)).toBe(false);
    expect(isSuspensionExpired({ active: false, until: NOW - DAY }, NOW)).toBe(false);
    expect(isSuspensionInForce({ active: false, until: null }, NOW)).toBe(false);
  });
  it('acepta Timestamp de Firestore (toMillis), Date, { seconds } y millis', () => {
    expect(suspensionMillis({ toMillis: () => 5 })).toBe(5);
    expect(suspensionMillis(new Date(7))).toBe(7);
    expect(suspensionMillis({ seconds: 2 })).toBe(2000);
    expect(suspensionMillis({ _seconds: 3 })).toBe(3000);
    expect(suspensionMillis(null)).toBeNull();
  });
  it('el barrido elige solo las vencidas', () => {
    const rows = [
      { id: 'a', suspension: { active: true, until: NOW - 1 } },
      { id: 'b', suspension: { active: true, until: NOW + DAY } },
      { id: 'c', suspension: { active: true, until: null } },
      { id: 'd', suspension: { active: false, until: NOW - DAY } },
      { id: 'e' },
    ];
    expect(pickExpiredSuspensions(rows, NOW).map(r => r.id)).toEqual(['a']);
  });
});

describe('canAppeal', () => {
  it('una sola apelación por suspensión y solo si está vigente', () => {
    expect(canAppeal({ active: true, until: null, appealId: null }, NOW)).toBe(true);
    expect(canAppeal({ active: true, until: null, appealId: 'ap-1' }, NOW)).toBe(false);
    expect(canAppeal({ active: false, until: null, appealId: null }, NOW)).toBe(false);
    expect(canAppeal({ active: true, until: NOW - 1, appealId: null }, NOW)).toBe(false);
    expect(canAppeal(null, NOW)).toBe(false);
  });
});

describe('textos', () => {
  it('describe el fin en hora argentina', () => {
    expect(describeSuspensionEnd(null)).toBe('hasta que la administración la revise');
    expect(describeSuspensionEnd(Date.UTC(2026, 10, 14, 13, 30))).toBe('hasta el 14/11/2026, 10:30');
  });
  it('el aviso lleva motivo, detalle, hasta cuándo y cómo apelar', () => {
    const body = suspensionNoticeBody({ reason: 'repeated_claims', detail, until: Date.UTC(2026, 10, 14, 13, 30), role: 'delivery' });
    expect(body).toContain('Reclamos reiterados');
    expect(body).toContain(detail);
    expect(body).toContain('14/11/2026');
    expect(body).toContain('Apelar');
    expect(suspensionNoticeBody({ reason: 'conduct', detail, until: null, role: 'store' })).toContain('Tu tienda no recibe pedidos nuevos');
  });
  it('link al panel de cada rol', () => {
    expect(ownerPanelLink('store')).toBe('/my-store');
    expect(ownerPanelLink('delivery')).toBe('/delivery');
  });
});
