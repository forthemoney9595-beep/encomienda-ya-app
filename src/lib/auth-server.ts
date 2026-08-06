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

// Niveles de admin (Fase DD): roles_admin/{uid}.level puede ser 'full' (todo el acceso,
// default si el campo no existe -- así los admins ya creados antes de esta fase no pierden
// nada) o 'support' (solo operativo). Las rutas que mueven plata, mandan broadcast, borran
// cuentas o cambian roles/config exigen 'full' -- mismo criterio que isFullAdmin() en
// firestore.rules.
export async function verifyFullAdmin(uid: string): Promise<boolean> {
  const adminDoc = await adminDb.collection('roles_admin').doc(uid).get();
  if (!adminDoc.exists) return false;
  return adminDoc.data()?.level !== 'support';
}

// Admin de cualquier nivel (incluye 'support'). Mismo criterio que isAdmin() en
// firestore.rules: el rol real lo decide roles_admin/{uid}, no users.role. Para rutas de
// solo lectura; cualquier cosa que mueva plata o cuentas debe usar verifyFullAdmin().
export async function verifyAdmin(uid: string): Promise<boolean> {
  const adminDoc = await adminDb.collection('roles_admin').doc(uid).get();
  return adminDoc.exists;
}
