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
