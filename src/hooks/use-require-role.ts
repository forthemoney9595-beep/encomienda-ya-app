'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';

type Role = 'buyer' | 'store' | 'delivery' | 'admin';

// ARQ-010 (auditoría oct 2026): el guard de rol estaba copiado en 12 páginas con 3 variantes
// y, sobre todo, las consultas de cada página corrían ANTES de que el guard redirigiera
// (un comprador que entraba a /delivery disparaba el listener del pool → permission-denied
// → ruido en Sentry). Este hook es el único guard, y devuelve `ready` para que las
// consultas se armen recién cuando el rol está confirmado (`ready ? query : null`).
//
// Semántica: mientras carga la sesión no redirige (ready=false); si no hay usuario o el rol
// no coincide → redirect (default '/'); si `requireStoreId` y el dueño no tiene tienda
// asociada → también redirect (caso que /my-store/categories ya contemplaba).
export function useRequireRole(
  role: Role | Role[],
  opts: { redirectTo?: string; requireStoreId?: boolean } = {},
) {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  const roles = Array.isArray(role) ? role : [role];
  const roleOk = !!userProfile && roles.includes(userProfile.role as Role);
  const storeOk = !opts.requireStoreId || !!userProfile?.storeId;
  const allowed = !!user && roleOk && storeOk;
  const ready = !loading && allowed;

  useEffect(() => {
    if (!loading && !allowed) router.push(opts.redirectTo ?? '/');
  }, [loading, allowed, router, opts.redirectTo]);

  return { ready, loading, user, userProfile };
}
