'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { useNotifications } from '@/context/notification-context';
import { usePathname } from 'next/navigation';

// Sonido de notificación suave (puedes cambiar la URL por una tuya si prefieres)
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

export function ChatListener(): null {
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { incrementUnread } = useNotifications();
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // El pathname se lee por REF (Tanda A de la auditoría): estaba en las deps del efecto
  // principal, así que CADA navegación tiraba abajo y volvía a levantar TODOS los
  // listeners de chat (con su costo en lecturas). Solo se usa para decidir si mostrar
  // el globito — no amerita re-suscribir nada.
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  // Inicializar el objeto de audio una sola vez
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    }
  }, []);

  const playSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      // El navegador puede bloquear el audio si no ha habido interacción previa del usuario — es esperable, no hace falta loggearlo
      audioRef.current.play().catch(() => {});
    }
  };

  useEffect(() => {
    if (!user || !firestore || !userProfile) return;

    // Definir qué pedidos escuchar según el rol del usuario
    const myRole = userProfile.role;
    let q;

    // Solo nos interesan los pedidos "vivos".
    // Fase PP: faltaban 'Listo para recoger' y 'En camino' — justo la ventana en la que
    // el chat comprador↔repartidor está habilitado (chat-window elige al repartidor como
    // destinatario en 'En camino'), y el ding nunca sonaba ahí. 'Entregado' NO se escucha
    // a propósito: sería un listener por CADA pedido histórico (sin techo); los mensajes
    // post-entrega llegan igual por la campanita.
    const activeStatuses = ['Pendiente de Confirmación', 'Pendiente de Pago', 'En preparación', 'Listo para recoger', 'En camino', 'En reparto'];

    if (myRole === 'store') {
        if (!userProfile.storeId) return;
        q = query(collection(firestore, 'orders'), where('storeId', '==', userProfile.storeId), where('status', 'in', activeStatuses));
    } else if (myRole === 'delivery') {
        q = query(collection(firestore, 'orders'), where('deliveryPersonId', '==', user.uid), where('status', 'in', activeStatuses));
    } else {
        // Cliente
        q = query(collection(firestore, 'orders'), where('userId', '==', user.uid), where('status', 'in', activeStatuses));
    }

    // Un listener de mensajes POR PEDIDO, con registro para poder desuscribir.
    // 🚨 Fuga corregida (Fase PP): antes cada `modified` de una orden apilaba OTRO
    // onSnapshot sobre la misma subcolección de mensajes (nunca se desuscribía ninguno),
    // así que el sonido podía dispararse N veces por un solo mensaje.
    const chatUnsubs = new Map<string, () => void>();

    // Escuchar la lista de pedidos activos
    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const orderId = change.doc.id;

        // Pedido que salió de los estados activos: soltar su listener de chat.
        if (change.type === 'removed') {
          chatUnsubs.get(orderId)?.();
          chatUnsubs.delete(orderId);
          return;
        }

        if (change.type === 'added' || change.type === 'modified') {
          // Ya escuchando este chat: no apilar otro listener.
          if (chatUnsubs.has(orderId)) return;

          // Por cada pedido activo, escuchamos SOLAMENTE el último mensaje
          const messagesQuery = query(
            collection(firestore, 'order_chats', orderId, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(1)
          );

          // Listener anidado para los mensajes de este pedido
          const unsubMsgs = onSnapshot(messagesQuery, (msgSnapshot) => {
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
                const isNotOnChatPage = !pathnameRef.current?.includes(`/orders/${orderId}`);

                if (isRecent && isNotMine) {
                  playSound(); // 🔊 Ding!
                  if (isNotOnChatPage) {
                    incrementUnread(); // 🔴 +1 al globo
                  }
                }
              }
            });
          });
          chatUnsubs.set(orderId, unsubMsgs);
        }
      });
    });

    return () => {
      unsubscribeOrders();
      // Soltar TODOS los listeners de chat (antes el cleanup solo cortaba el de órdenes
      // y los anidados quedaban vivos para siempre).
      chatUnsubs.forEach(unsub => unsub());
      chatUnsubs.clear();
    };
    // pathname fuera de las deps a propósito (se lee por ref, ver arriba);
    // incrementUnread ahora es estable (useCallback en el provider) — el loop del ding
    // repetido venía de que cambiaba de identidad en cada render.
  }, [user, firestore, userProfile, incrementUnread]);

  // Este componente es invisible, solo lógica
  return null; 
}