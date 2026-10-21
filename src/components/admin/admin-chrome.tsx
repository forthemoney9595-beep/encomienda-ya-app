'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Estado compartido entre el shell (topbar) y la página activa: las migas y si la página
 * tiene un listener en vivo (el chip "En vivo" solo pulsa cuando hay uno; las páginas
 * paginadas muestran "Actualizado hace N min · Refrescar").
 */
export interface Crumb { label: string; href?: string }

interface AdminChromeValue {
  crumbs: Crumb[] | null;
  setCrumbs: (c: Crumb[] | null) => void;
  live: boolean;
  setLive: (v: boolean) => void;
}

const Ctx = createContext<AdminChromeValue | null>(null);

export function AdminChromeProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  const [live, setLive] = useState(false);
  const value = useMemo(() => ({ crumbs, setCrumbs, live, setLive }), [crumbs, live]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminChrome(): AdminChromeValue {
  return useContext(Ctx) ?? { crumbs: null, setCrumbs: () => {}, live: false, setLive: () => {} };
}

/** Publica las migas de la página mientras está montada (las limpia al salir). */
export function useAdminCrumbs(crumbs: Crumb[] | null | undefined) {
  const { setCrumbs } = useAdminChrome();
  const key = JSON.stringify(crumbs ?? null);
  useEffect(() => {
    setCrumbs(crumbs ?? null);
    return () => setCrumbs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setCrumbs]);
}

/** Marca la página como "en vivo" mientras esté montada. */
export function useAdminLive(live: boolean = true) {
  const { setLive } = useAdminChrome();
  useEffect(() => {
    setLive(live);
    return () => setLive(false);
  }, [live, setLive]);
}
