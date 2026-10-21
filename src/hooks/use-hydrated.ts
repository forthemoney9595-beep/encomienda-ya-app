'use client';
import { useEffect, useState } from 'react';

// CY-006 / FE-R-011 (auditoría oct 2026): un toque en "Entrar"/"Crear cuenta" ANTES de que
// React hidrate dispara el submit NATIVO del <form> (GET a la misma URL): recarga la página,
// borra lo tipeado y en los signups mandaba contraseña y DNI por la URL. En un Android lento
// pasa seguido. Con esto el botón queda deshabilitado hasta que el handler de React existe.
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return hydrated;
}
