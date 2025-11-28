'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { useNotifications } from '@/context/notification-context';
import { usePathname } from 'next/navigation';

// Sonido de notificación suave (puedes cambiar la URL por una tuya si prefieres)
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

export function ChatListener() {
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { incrementUnread } = useNotifications();
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Inicializar el objeto de audio una sola vez
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    }
  }, []);

  const playSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      // El navegador puede bloquear el audio si no ha habido interacción previa del usuario
      audioRef.current.play().catch(e => console.log("Audio play failed (user interaction needed first)", e));
    }
  };

  useEffect(() => {
    if (!user || !firestore || !userProfile) return;

    // Definir qué pedidos escuchar según el rol del usuario
    const myRole = userProfile.role;
    let q;

    // Solo nos interesan los pedidos "vivos"
    const activeStatuses = ['Pendiente de Confirmación', 'Pendiente de Pago', 'En preparación', 'En reparto'];

    if (myRole === 'store') {
        if (!userProfile.storeId) return;
        q = query(collection(firestore, 'orders'), where('storeId', '==', userProfile.storeId), where('status', 'in', activeStatuses));
    } else if (myRole === 'delivery') {
        q = query(collection(firestore, 'orders'), where('deliveryPersonId', '==', user.uid), where('status', 'in', activeStatuses));
    } else {
        // Cliente
        q = query(collection(firestore, 'orders'), where('userId', '==', user.uid), where('status', 'in', activeStatuses));
    }

    // Escuchar la lista de pedidos activos
    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        // Si entra un pedido nuevo o se modifica uno existente en la lista
        if (change.type === 'added' || change.type === 'modified') {
          const orderId = change.doc.id;
          
          // Por cada pedido activo, escuchamos SOLAMENTE el último mensaje
          const messagesQuery = query(
            collection(firestore, 'order_chats', orderId, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(1)
          );

          // Listener anidado para los mensajes de este pedido
          onSnapshot(messagesQuery, (msgSnapshot) => {
            msgSnapshot.docChanges().forEach((msgChange) => {
              if (msgChange.type === 'added') {
                const msgData = msgChange.doc.data();
                
                // VALIDACIONES PARA SONAR LA ALERTA:
                
                // 1. ¿Es reciente? (Evita que suene al cargar el historial viejo)
                // Usamos 10 segundos de margen
                const isRecent = msgData.createdAt?.toMillis() > Date.now() - 10000;
                
                // 2. ¿No es mío? (No quiero notificarme a mí mismo)
                const isNotMine = msgData.senderId !== user.uid;
                
                // 3. ¿No estoy viendo ya ese chat? (Si estoy en la página del pedido, no necesito alerta)
                const isNotOnChatPage = !pathname?.includes(`/orders/${orderId}`);

                if (isRecent && isNotMine) {
                  playSound(); // 🔊 Ding!
                  if (isNotOnChatPage) {
                    incrementUnread(); // 🔴 +1 al globo
                  }
                }
              }
            });
          });
        }
      });
    });

    return () => unsubscribeOrders();
  }, [user, firestore, userProfile, pathname, incrementUnread]);

  // Este componente es invisible, solo lógica
  return null; 
}