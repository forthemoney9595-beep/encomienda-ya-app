'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, KeyRound } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';

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
        toast({ title: '¡Entrega Completada!', description: 'Ganancia registrada en tu Billetera.' });
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
      <DialogContent className="sm:max-w-md">
        {step === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle>Confirmar Entrega</DialogTitle>
              <DialogDescription>
                ¿Entregaste el pedido{customerName ? ` a ${customerName}` : ''}?
              </DialogDescription>
            </DialogHeader>

            {(cashTotal || 0) > 0 && (
              <div className="bg-warning/15 p-4 rounded-lg border border-warning text-center my-2">
                <p className="font-bold text-warning uppercase">¡COBRAR AL CLIENTE!</p>
                <h3 className="font-black text-2xl text-foreground">${cashTotal}</h3>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
              <Button className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => submit(false)} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sí, Entregado
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" /> Código de entrega
              </DialogTitle>
              <DialogDescription>
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
              className="h-14 text-center text-3xl font-bold tracking-[0.5em]"
              autoFocus
            />

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            <p className="text-xs text-muted-foreground">
              ¿El cliente no está o no encuentra el código? Cerrá esto y usá
              «Reportar problema» — lo resuelve la administración.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
              <Button className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => submit(true)} disabled={loading || pin.length !== 4}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar Entrega
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
