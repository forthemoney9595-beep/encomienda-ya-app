'use client';

import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import { Switch } from '@/components/ui/switch';
import { Garland } from '@/components/garland';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/** Punto de "disponible": verde que late (anillo que se expande); gris y quieto si no. */
export function DriverPulseDot({ on, className }: { on: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-3.5 w-3.5 shrink-0', className)} aria-hidden="true">
      {on && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />}
      <span className={cn('relative inline-flex h-3.5 w-3.5 rounded-full', on ? 'bg-success' : 'bg-muted-foreground')} />
    </span>
  );
}

// Switch de disponibilidad del repartidor (users/{uid}.isOnline). Sin valor = disponible
// (para no dejar de avisarle a nadie que nunca tocó el switch) -- ver /api/orders/
// notify-drivers y /api/orders/release, que ahora excluyen explícitamente isOnline===false
// del broadcast de "pedido disponible".
//
// Dos formas (rediseño en vidrio, 9/11/2026), MISMO switch y mismo handler:
// - 'inline' (default): punto + texto + switch, para el encabezado del panel de entregas.
// - 'card': la tarjeta de vidrio de arriba de /delivery, con título grande y guirnalda.
export function DeliveryOnlineToggle({ className, variant = 'inline' }: { className?: string; variant?: 'inline' | 'card' }) {
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const isOnline = (userProfile as { isOnline?: boolean } | null)?.isOnline !== false;

  const handleToggle = async (checked: boolean) => {
    if (!firestore || !user) return;
    try {
      await updateDoc(doc(firestore, 'users', user.uid), { isOnline: checked });
      toast({
        title: checked ? 'Estás disponible' : 'Ya no estás disponible',
        description: checked
          ? 'Vas a recibir avisos de pedidos nuevos.'
          : 'No te van a llegar avisos de pedidos hasta que te reconectes.',
      });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cambiar tu disponibilidad.' });
    }
  };

  const sw = (
    <Switch
      aria-label={isOnline ? 'Disponible para repartir' : 'No disponible'}
      checked={isOnline}
      onCheckedChange={handleToggle}
      data-testid="driver-online-switch"
      id="driver-online-switch"
      className="mx-2 scale-[1.35]"
    />
  );

  if (variant === 'card') {
    return (
      <section
        className={cn('glass-strong relative flex items-center gap-4 rounded-card p-4 sm:p-5', className)}
        data-testid="driver-availability"
        data-online={isOnline ? 'true' : 'false'}
      >
        <Garland />
        <DriverPulseDot on={isOnline} />
        <label htmlFor="driver-online-switch" className="min-w-0 flex-1 cursor-pointer py-1">
          <p className="font-headline text-[1.6rem] font-extrabold leading-none">
            {isOnline ? 'Estás disponible' : 'No disponible'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isOnline ? 'Te avisamos con un sonido cuando haya un pedido.' : 'No te llegan avisos de pedidos nuevos.'}
          </p>
        </label>
        {sw}
      </section>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <DriverPulseDot on={isOnline} />
        <label htmlFor="driver-online-switch" className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{isOnline ? 'Disponible' : 'No disponible'}</label>
        {sw}
      </div>
    </div>
  );
}
