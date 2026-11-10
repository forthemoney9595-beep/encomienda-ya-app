'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, KeyRound, PackageCheck } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { money } from '@/lib/format-money';

/**
 * Diálogo ÚNICO de "Confirmar Entrega" con PIN (19/8) — lo usan los 3 botones de
 * Entregado del repartidor (panel de entregas, detalle del pedido y el updater).
 * Tener un solo camino es la lección R1: dos caminos que divergen = bug seguro.
 *
 * Flujo: primer intento SIN código → si el servidor responde `pin_required` (428) se
 * pide el código de 4 dígitos que el CLIENTE tiene en su pantalla. Los pedidos viejos
 * (sin PIN) se completan directo — por eso no se pide el código de entrada.
 */
export function ConfirmDeliveryDialog({
  open, onOpenChange, orderId, customerName, cashTotal, user, onDelivered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  customerName?: string;
  /** Total a cobrar si el pedido es en efectivo (muestra la alerta de COBRAR). */
  cashTotal?: number | null;
  user: User | null;
  onDelivered?: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<'confirm' | 'pin'>('confirm');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setStep('confirm'); setPin(''); setError(''); setLoading(false); };

  const submit = async (withPin: boolean) => {
    if (!user || !orderId) return;
    setLoading(true);
    setError('');
    try {
      const res = await authedFetch('/api/orders/confirm-delivery', user, {
        orderId,
        ...(withPin ? { pin: pin.trim() } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: 'Entrega completada', description: 'La ganancia ya está en tu billetera.' });
        reset();
        onOpenChange(false);
        onDelivered?.();
        return;
      }
      if (res.status === 428) {
        // El pedido tiene PIN: pasar a pedirlo.
        setStep('pin');
        return;
      }
      setError(data.error || 'No se pudo confirmar la entrega.');
    } catch {
      setError('No se pudo confirmar. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="w-[calc(100%-1.5rem)] rounded-card sm:max-w-md sm:rounded-card" data-testid="confirm-delivery-dialog">
        {step === 'confirm' ? (
          <>
            <DialogHeader>
              <span className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-success/15 text-success sm:mx-0 mx-auto">
                <PackageCheck className="h-6 w-6" aria-hidden="true" />
              </span>
              <DialogTitle className="font-headline text-2xl font-extrabold">Confirmar entrega</DialogTitle>
              <DialogDescription className="text-base">
                ¿Entregaste el pedido{customerName ? ` a ${customerName}` : ''}?
              </DialogDescription>
            </DialogHeader>

            {(cashTotal || 0) > 0 && (
              <div className="my-1 rounded-2xl border-2 border-warning bg-warning/10 p-4 text-center">
                <p className="text-sm font-bold uppercase tracking-wide">Cobrale al cliente</p>
                <p className="font-headline text-4xl font-extrabold tabular-nums">{money(cashTotal || 0)}</p>
              </div>
            )}

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

            <DialogFooter className="gap-2">
              <Button variant="outline" className="h-12 rounded-2xl" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
              <Button className="h-12 rounded-2xl bg-success text-base font-bold text-success-foreground hover:bg-success/90" onClick={() => submit(false)} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sí, lo entregué
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-headline text-2xl font-extrabold">
                <KeyRound className="h-6 w-6 text-primary" aria-hidden="true" /> Código de entrega
              </DialogTitle>
              <DialogDescription className="text-base">
                Pedile al cliente el <strong>código de 4 dígitos</strong> — lo tiene en su
                pantalla del pedido. Es la prueba de que el pedido llegó a sus manos.
              </DialogDescription>
            </DialogHeader>

            <Input
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="• • • •"
              className="h-16 rounded-2xl text-center font-headline text-4xl font-extrabold tracking-[0.5em] tabular-nums"
              aria-label="Código de entrega de 4 números"
              data-testid="delivery-pin-input"
              autoFocus
            />

            {error && <p className="text-center text-sm text-destructive" role="alert">{error}</p>}

            <p className="text-sm text-muted-foreground">
              ¿El cliente no está o no encuentra el código? Cerrá esto y usá
              «Reportar problema»: lo resuelve la administración.
            </p>

            <DialogFooter className="gap-2">
              <Button variant="outline" className="h-12 rounded-2xl" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
              <Button className="h-12 rounded-2xl bg-success text-base font-bold text-success-foreground hover:bg-success/90" onClick={() => submit(true)} disabled={loading || pin.length !== 4} data-testid="delivery-pin-submit">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar entrega
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
