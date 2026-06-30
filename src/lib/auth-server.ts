import { adminAuth, adminDb } from '@/lib/firebase-admin';

// Verifica el ID token de Firebase que manda el cliente en el header Authorization.
// Devuelve el uid real (probado por Firebase, no lo que diga el body) o null si no
// hay token / es inválido / expiró.
export async function verifyAuthToken(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

// Mismo criterio que isStoreOwner() en firestore.rules: el dueño real de una tienda es
// quien figura en stores/{storeId}.ownerId, no lo que mande el cliente.
export async function verifyStoreOwnership(uid: string, storeId: string): Promise<boolean> {
  const storeDoc = await adminDb.collection('stores').doc(storeId).get();
  return storeDoc.exists && storeDoc.data()?.ownerId === uid;
}
