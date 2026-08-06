import type { User } from 'firebase/auth';

// POST con el ID token de Firebase del usuario actual en el header Authorization, para
// que las API routes puedan probar quién llama en vez de confiar en lo que mande el body.
export async function authedFetch(url: string, user: User | null, body: unknown): Promise<Response> {
  const token = user ? await user.getIdToken() : null;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

// Igual que authedFetch pero para rutas de solo lectura (GET), que no llevan body.
export async function authedGet(url: string, user: User | null): Promise<Response> {
  const token = user ? await user.getIdToken() : null;
  return fetch(url, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
