'use client';

import { getOrCreateChat } from '@/lib/chat-service';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { MessageCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';


export function ContactStore({ storeId }: { storeId: string }) {
  const { user, loading: authLoading } = useAuth();
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
      const chatId = await getOrCreateChat(user.uid, storeId);
      router.push(`/chat/${chatId}`);
    } catch (error) {
      console.error('Error creating or getting chat:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo iniciar el chat. Inténtalo de nuevo.',
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || (user && user.storeId === storeId)) {
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
