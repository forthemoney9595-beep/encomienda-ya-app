'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onMessage } from 'firebase/messaging';
import { messaging } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { playBeep } from '@/lib/beep';

// Banner + sonido cuando llega un push CON LA APP ABIERTA (punto 4 de la prueba, 18/8).
// El service worker solo muestra el push en segundo plano; con la app en primer plano el
// push llegaba y se PERDÍA (no había handler onMessage), así que el cliente no se
// enteraba del cambio de estado si estaba mirando otra tienda. Ahora salta un toast
// prominente con sonido y botón "Ver" que lleva al destino del push (data.url).
export function ForegroundPush(): null {
  const router = useRouter();
  const { toast } = useToast();
  // Anti-duplicado: el mismo mensaje puede dispararse dos veces en algunos navegadores.
  const lastRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  useEffect(() => {
    if (!messaging) return;
    const unsub = onMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.title || 'EncomiendaYA';
      const body = payload.notification?.body || payload.data?.body || '';
      const url = (payload.data?.url as string) || (payload.fcmOptions as any)?.link || '/';

      const key = `${title}|${body}`;
      if (key === lastRef.current.key && Date.now() - lastRef.current.at < 4000) return;
      lastRef.current = { key, at: Date.now() };

      playBeep();
      toast({
        title,
        description: body,
        duration: 8000,
        action: url && url !== '/' ? (
          <ToastAction altText="Ver" onClick={() => router.push(url)}>Ver</ToastAction>
        ) : undefined,
      });
    });
    return () => { try { unsub(); } catch { /* noop */ } };
  }, [router, toast]);

  return null;
}
