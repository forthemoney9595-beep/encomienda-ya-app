/**
 * Búsqueda de usuarios del panel admin (18/8).
 *
 * Firestore NO busca por substring server-side (solo prefijo, y distinguiendo
 * mayúsculas) — por eso "luis" nunca encontraba a "jorge luis". A escala Tinogasta la
 * solución honesta es bajar la colección UNA vez por sesión de búsqueda (getDocs con
 * tope) y filtrar en memoria por nombre/email/teléfono/DNI, con caché de módulo para
 * que las búsquedas siguientes no lean nada.
 *
 * Relación con la regla de escala (Fases Y/Z): esto es una lectura ON-DEMAND del admin
 * (solo cuando escribe en un buscador), con tope y caché — no una query en cada carga
 * de página. Si la base llega al tope, `capped` lo avisa en la UI; ahí toca migrar a
 * un índice de búsqueda real (searchTokens o servicio externo).
 */
import { collection, getDocs, limit, query, type Firestore } from 'firebase/firestore';

export const ADMIN_SEARCH_CAP = 2000;
const CACHE_TTL_MS = 5 * 60 * 1000; // un admin buscando ve las altas nuevas al rato

type SearchCache = { users: any[]; capped: boolean; at: number };
let cache: SearchCache | null = null;
let inflight: Promise<SearchCache> | null = null;

/** minúsculas + sin acentos, para que "jose" encuentre "José".
 * OJO: el rango va con escapes \u explícitos, nunca los caracteres combinantes
 * literales — una re-codificación del archivo los rompería en silencio. */
export function normalizeText(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function digitsOnly(s: string): string {
  return (s || '').replace(/\D+/g, '');
}

/** Baja los usuarios para buscar (una vez, con caché de 5 min compartida entre
 * pantallas — Gestión de Usuarios y ⌘K usan la misma). */
export async function fetchUsersForSearch(firestore: Firestore): Promise<SearchCache> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = getDocs(query(collection(firestore, 'users'), limit(ADMIN_SEARCH_CAP)))
    .then(snap => {
      cache = {
        users: snap.docs.map(d => ({ id: d.id, ...d.data() })),
        capped: snap.docs.length >= ADMIN_SEARCH_CAP,
        at: Date.now(),
      };
      return cache;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function invalidateUserSearchCache(): void {
  cache = null;
}

/** ¿El usuario matchea lo tipeado? Substring sobre nombre/email (sin acentos ni
 * mayúsculas) y sobre los DÍGITOS de teléfono/DNI/CUIT-CUIL (así "383 740" o
 * "3837-40" encuentran igual). Los dígitos piden mínimo 3 para no matchear todo. */
export function userMatchesSearch(u: any, rawTerm: string): boolean {
  const term = normalizeText(rawTerm.trim());
  if (!term) return true;
  const textHaystack = normalizeText(`${u.name || ''} ${u.displayName || ''} ${u.email || ''}`);
  if (textHaystack.includes(term)) return true;
  const digits = digitsOnly(rawTerm);
  if (digits.length >= 3) {
    const numHaystack = `${digitsOnly(u.phoneNumber)} ${digitsOnly(u.dni)} ${digitsOnly(u.cuil)} ${digitsOnly(u.cuit)}`;
    if (numHaystack.includes(digits)) return true;
  }
  return false;
}
