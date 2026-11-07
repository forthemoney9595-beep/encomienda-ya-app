'use client';

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { fmtDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

// Cuenta regresiva del plazo de confirmación (Fase YY). `timeoutAt` lo devuelve el servidor
// (/api/orders/confirm-timeout vía useConfirmTimeoutWatcher), así que la hora mostrada es
// la que el servidor va a respetar, no una cuenta del navegador.
export function ConfirmCountdown({ timeoutAt, variant, className }: { timeoutAt: number | null | undefined; variant: 'buyer' | 'store'; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  if (!timeoutAt) return null;
  const left = Math.max(0, Math.ceil((timeoutAt - now) / 60_000));
  const expired = timeoutAt <= now;
  const at = fmtDate(timeoutAt, 'time');

  return (
    <div
      data-testid="confirm-countdown"
      className={cn(
        'flex items-start gap-2 rounded-lg border p-3 text-sm',
        expired || left <= 3 ? 'border-destructive/40 bg-destructive/10' : 'border-warning/40 bg-warning/10',
        className,
      )}
    >
      <Timer className={cn('mt-0.5 h-4 w-4 shrink-0', expired || left <= 3 ? 'text-destructive' : 'text-warning')} aria-hidden="true" />
      <p>
        {expired
          ? 'Venció el plazo de confirmación: el pedido se está cancelando.'
          : variant === 'buyer'
            ? <>La tienda tiene hasta las <strong>{at}</strong> para confirmar (quedan {left} min). Si no confirma, el pedido se cancela solo y no se te cobra nada.</>
            : <>Confirmá antes de las <strong>{at}</strong> (quedan {left} min) o el pedido se cancela solo.</>}
      </p>
    </div>
  );
}
