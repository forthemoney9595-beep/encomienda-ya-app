'use client';

import { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { db, useDoc, useMemoFirebase } from '@/lib/firebase';
import { useAuth } from '@/context/auth-context';
import { isChristmasActive, normalizeChristmasMode, type ChristmasMode } from '@/lib/seasonal';

/**
 * ¿Va la decoración de Navidad? Lee `config/platform.christmasMode` ('auto' por defecto) y
 * decide con `isChristmasActive` (8/12 al 6/1 hora Argentina).
 *
 * - `config/platform` exige estar logueado (regla `read: if isSignedIn()`): el INVITADO no
 *   lo lee y usa 'auto' (mismo criterio que el envío del inicio).
 * - Varias guirnaldas en la misma pantalla no multiplican lecturas: el SDK de Firestore
 *   comparte un solo listener para el mismo documento.
 * - `active` arranca en false y se calcula recién al montar: así el HTML del servidor y
 *   el primer render del cliente coinciden (sin aviso de hidratación) y la fecha es la del
 *   celular, no la del servidor. Se re-evalúa cada 10 minutos (cruce de medianoche).
 */
export function useChristmas(): { active: boolean; mode: ChristmasMode } {
  const { user } = useAuth();
  const ref = useMemoFirebase(() => (user ? doc(db, 'config', 'platform') : null), [user]);
  const { data } = useDoc<{ christmasMode?: unknown }>(ref);
  const configMode = normalizeChristmasMode(data?.christmasMode);

  // SOLO en desarrollo: `localStorage['eya-xmas-preview'] = 'on' | 'off'` pisa la config para
  // poder mirar la decoración en noviembre sin escribir `config/platform` (lo usan los
  // scripts de Playwright). En producción ni se lee.
  const [active, setActive] = useState(false);
  useEffect(() => {
    let mode = configMode;
    if (process.env.NODE_ENV !== 'production') {
      try {
        const v = localStorage.getItem('eya-xmas-preview');
        if (v === 'on' || v === 'off') mode = v;
      } catch {}
    }
    const evaluate = () => setActive(isChristmasActive(Date.now(), mode));
    evaluate();
    if (mode !== 'auto') return;
    const t = setInterval(evaluate, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [configMode]);

  return { active, mode: configMode };
}
