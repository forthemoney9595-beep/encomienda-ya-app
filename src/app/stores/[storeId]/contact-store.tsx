
'use client';

import { getOrCreateChat } from '@/lib/chat-service';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { MessageCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { usePrototypeData } from '@/context/prototype-data-context';
import { getPlaceholderImage } from '@/lib/placeholder-images';

export function ContactStore({ storeId }: { storeId: string }) {
  const { user, loading: authLoading } = useAuth();
  const { getStoreById, loading: prototypeLoading } = usePrototypeData();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleContact = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    setLoading(true);
    try {
      const store = getStoreById(storeId);
      if (!store || !store.ownerId) {
        throw new Error("Información de la tienda o del propietario no encontrada.");
      }
      
      const currentUserInfo = {
        uid: user.uid,
        name: user.name,
        role: user.role,
        imageUrl: getPlaceholderImage(user.uid, 64, 64)
      };

      const storeInfo = {
        id: store.id,
        name: store.name,
        ownerId: store.ownerId,
        imageUrl: store.imageUrl
      };

      const chatId = await getOrCreateChat(currentUserInfo, storeInfo);
      router.push(`/chat/${chatId}`);
    } catch (error: any) {
      console.error('Error creating or getting chat:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo iniciar el chat. Inténtalo de nuevo.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || prototypeLoading || (user && user.storeId === storeId)) {
    return null;
  }
  
  return (
    <Button onClick={handleContact} disabled={loading} className="w-full">
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <MessageCircle className="mr-2 h-4 w-4" />
      )}
      {loading ? 'Iniciando Chat...' : 'Contactar con la tienda'}
    </Button>
  );
}
