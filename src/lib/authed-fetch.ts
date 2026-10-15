import type { User } from 'firebase/auth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// POST con el ID token de Firebase del usuario actual en el header Authorization, para
// que las API routes puedan probar quién llama en vez de confiar en lo que mande el body.
//
// 🚨 ARQ-004 / CY-002 (auditoría oct 2026) — sesión vencida o cuenta deshabilitada: antes
// `getIdToken()` iba sin try/catch y nadie miraba `res.status`, así que tras >1 h en segundo
// plano (típico del APK) o si el admin borraba/deshabilitaba la cuenta, cada acción fallaba
// con un toast "No autorizado" que parecía un bug de permisos y nadie decía "volvé a entrar".
// Ahora: (1) si Firebase no puede renovar el token (expirado/deshabilitado/borrado) o (2) el
// servidor responde 401 incluso tras un reintento con token FORZADO, se cierra la sesión y
// se va a /login?expired=1&next=<ruta actual>. Es una navegación dura a propósito: corta
// cualquier estado a medias y no depende de que los 18 llamadores manejen el error.

export class SessionExpiredError extends Error {
  constructor() { super('Tu sesión venció. Volvé a iniciar sesión.'); this.name = 'SessionExpiredError'; }
}

const AUTH_DEAD_CODES = /user-token-expired|user-disabled|user-not-found|invalid-user-token|null-user|requires-recent-login/;

let redirecting = false;
export async function handleSessionExpired(): Promise<never> {
  if (typeof window !== 'undefined' && !redirecting) {
    redirecting = true;
    const next = window.location.pathname + window.location.search;
    try { await signOut(auth); } catch { /* ya estaba cerrada */ }
    const target = `/login?expired=1&next=${encodeURIComponent(next)}`;
    window.location.href = target;
  }
  throw new SessionExpiredError();
}

async function tokenFor(user: User | null, force = false): Promise<string | null> {
  if (!user) return null;
  try {
    return await user.getIdToken(force);
  } catch (e: any) {
    if (AUTH_DEAD_CODES.test(String(e?.code ?? ''))) return handleSessionExpired();
    throw e;
  }
}

async function send(url: string, init: RequestInit, user: User | null): Promise<Response> {
  const token = await tokenFor(user);
  const withAuth = (t: string | null): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  });
  let res = await fetch(url, withAuth(token));
  if (res.status === 401 && user) {
    // Un 401 con usuario presente = el token que mandamos ya no sirve. Un reintento con
    // token forzado cubre el caso "venció justo ahora"; si sigue 401, la sesión está muerta
    // (cuenta deshabilitada/borrada, sesiones revocadas, token no renovable).
    const fresh = await tokenFor(user, true);
    res = await fetch(url, withAuth(fresh));
    if (res.status === 401) return handleSessionExpired();
  }
  return res;
}

export async function authedFetch(url: string, user: User | null, body: unknown): Promise<Response> {
  return send(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, user);
}

// Igual que authedFetch pero para rutas de solo lectura (GET), que no llevan body.
export async function authedGet(url: string, user: User | null): Promise<Response> {
  return send(url, { method: 'GET' }, user);
}
