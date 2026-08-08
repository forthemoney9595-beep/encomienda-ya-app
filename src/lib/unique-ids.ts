'use client';

// Helpers del registro anti multi-cuenta (Fase PP) — colección `unique_ids`.
// Un doc por dato real, con el DATO en el id: `dni_12345678`, `cuit_20123456789`,
// `tel_3834123456`. Se reservan en el MISMO batch que crea la cuenta: si el dato ya
// está tomado, el create choca contra el doc existente y el batch entero falla — la
// unicidad la garantizan las reglas, no la UI.
//
// OJO anotado: el teléfono se reserva AL REGISTRARSE; si después se edita en /profile no
// se re-chequea (mantener la reserva viva en cada edición es otra pieza — por ahora el
// objetivo es frenar la creación de multi-cuentas, no el ciclo de vida completo).

import { Firestore, doc, getDoc, type DocumentReference } from 'firebase/firestore';

export const digitsOnly = (s: string): string => (s || '').replace(/\D/g, '');

export type UniqueIdType = 'dni' | 'cuit' | 'tel';

export const uniqueKey = (type: UniqueIdType, raw: string): string => `${type}_${digitsOnly(raw)}`;

export const uniqueRef = (db: Firestore, type: UniqueIdType, raw: string): DocumentReference =>
  doc(db, 'unique_ids', uniqueKey(type, raw));

/** Pre-chequeo para mostrar un error claro; la garantía real es el create del batch. */
export async function isTaken(db: Firestore, type: UniqueIdType, raw: string): Promise<boolean> {
  const snap = await getDoc(uniqueRef(db, type, raw));
  return snap.exists();
}

/** Payload estándar del doc de reserva. */
export const uniquePayload = (type: UniqueIdType, raw: string, uid: string) => ({
  type,
  value: digitsOnly(raw),
  uid,
  createdAt: new Date(),
});
