import * as admin from 'firebase-admin';

// Evitamos inicializarlo múltiples veces (Hot Reloading fix)
if (!admin.apps.length) {
  // Manejo especial para la clave privada:
  // Vercel/Next.js a veces escapa los saltos de línea (\n), así que los restauramos.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}

export const adminMessaging = admin.messaging();
export const adminDb = admin.firestore();