'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * Escucha los 'permission-error' que emiten los hooks de la capa `@/firebase`.
 *
 * 🚨 BUG-300 (auditoría pre-producción): antes este componente RE-LANZABA el error, que
 * caía en `global-error.tsx` y crasheaba TODA la app a "Algo salió mal". Como el provider
 * envuelve toda la app, cualquier permission-denied de una de las páginas que usan `@/firebase`
 * (favorites, my-store/categories, admin/delivery/[driverId]) tiraba la pantalla completa —
 * era la causa del "Algo salió mal" intermitente del arranque (un estado de auth transitorio
 * o un admin 'support' bastaban). Un permission-denied NO debe voltear la app entera: ahora se
 * reporta a Sentry + consola (para no perder visibilidad) y la página sigue con datos vacíos,
 * igual que la capa `@/lib/firebase`. La unificación real de las dos capas queda para después.
 */
export function FirebaseErrorListener(): null {
  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      console.error('[Firebase permission-error]', error?.message || error);
      Sentry.captureException(error, { tags: { source: 'FirebaseErrorListener' } });
    };
    errorEmitter.on('permission-error', handleError);
    return () => { errorEmitter.off('permission-error', handleError); };
  }, []);

  return null;
}
