'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// El dashboard se unificó en /admin (Fase de reestructuración del panel admin).
// Esta ruta ahora solo redirige, para no romper bookmarks ni enlaces existentes.
export default function AdminDashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
