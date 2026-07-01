'use client';

import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

// Switch de disponibilidad del repartidor (users/{uid}.isOnline). Sin valor = disponible
// (para no dejar de avisarle a nadie que nunca tocó el switch) -- ver /api/orders/
// notify-drivers y /api/orders/release, que ahora excluyen explícitamente isOnline===false
// del broadcast de "pedido disponible".
export function DeliveryOnlineToggle({ className }: { className?: string }) {
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const isOnline = (userProfile as any)?.isOnline !== false;

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

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-success' : 'bg-muted-foreground'}`} />
        <span className="text-sm font-medium">{isOnline ? 'Disponible' : 'No disponible'}</span>
        <Switch checked={isOnline} onCheckedChange={handleToggle} />
      </div>
    </div>
  );
}
