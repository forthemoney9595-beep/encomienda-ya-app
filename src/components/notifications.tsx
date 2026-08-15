'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useFirestore, requestNotificationPermission } from '@/lib/firebase';
import { collection, query, where, limit, doc, updateDoc, writeBatch, orderBy, onSnapshot, arrayUnion } from 'firebase/firestore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Bell, CheckCircle2, AlertCircle, Package, Info, Truck, Trash2, BellRing, DollarSign, Wallet } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export function Notifications() {
  const { user, userProfile } = useAuth(); // Agregamos userProfile para saber el rol
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [localNotifications, setLocalNotifications] = useState<any[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

  // 1. Estado de Permisos — se re-lee también cada vez que se ABRE la campanita: si el
  // permiso se concedió por otro camino (el pedido automático del login, o Ajustes de
  // Android), el botón "Activar Avisos Push" seguía mostrándose con el estado viejo.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermissionStatus(Notification.permission);
    }
  }, [open]);

  // 2. LISTENER EN TIEMPO REAL MANUAL
  useEffect(() => {
    if (!firestore || !user?.uid) return;

    // IMPORTANTE: el orderBy('createdAt','desc') es obligatorio. Sin él, Firestore
    // ordena por ID de documento (aleatorio), y al pasar de 20 notificaciones las
    // nuevas quedaban dentro o fuera del limite al azar — la campanita fallaba de
    // forma intermitente. Requiere el indice compuesto en firestore.indexes.json.
    const q = query(
        collection(firestore, 'notifications'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        notifs.sort((a: any, b: any) => {
            const dateA = a.createdAt?.seconds || 0;
            const dateB = b.createdAt?.seconds || 0;
            return dateB - dateA; 
        });

        setLocalNotifications(notifs);
    }, (error) => {
        console.error("❌ [Notificaciones] Error escuchando:", error);
    });

    return () => unsubscribe();
  }, [firestore, user?.uid]);
  
  const unreadCount = localNotifications.filter((n: any) => !n.read).length;

  // REGLA (prueba del APK, 15/8): tocar el botón SIEMPRE termina en un aviso visible —
  // ningún camino puede morir en silencio, incluido el catch. En la app empaquetada el
  // permiso puede quedar en estados raros y sin el motivo a la vista no se puede
  // diagnosticar nada.
  const handleEnableNotifications = async () => {
      try {
          const { token, error } = await requestNotificationPermission();
          const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
          setPermissionStatus(perm);

          if (token && user && firestore) {
              // Mismos DOS campos que escribe auth-context (fcmToken + fcmTokens): este
              // camino escribía solo fcmToken y pisaba el soporte multi-dispositivo.
              try {
                  await updateDoc(doc(firestore, 'users', user.uid), {
                      fcmToken: token,
                      fcmTokens: arrayUnion(token),
                      notificationsEnabled: true
                  });
              } catch (saveErr: any) {
                  toast({
                      variant: "destructive",
                      title: "El permiso quedó activo pero no se pudo guardar",
                      description: String(saveErr?.message || saveErr).slice(0, 140),
                  });
                  return;
              }
              toast({ title: "¡Avisos activados!", description: "Este dispositivo va a recibir notificaciones." });
          } else if (perm === 'denied') {
              toast({
                  variant: "destructive",
                  title: "Notificaciones bloqueadas",
                  description: "Activalas desde Ajustes de Android → Apps → EncomiendaYA → Notificaciones.",
              });
          } else {
              // Cualquier otra combinación (permiso a medias, token que no llegó, etc.):
              // mostrar el motivo real si lo hay.
              toast({
                  variant: "destructive",
                  title: "No se pudo completar la activación",
                  description: error || "Puede que el diálogo se haya cerrado sin elegir. Probá de nuevo.",
              });
          }
      } catch (error: any) {
          console.error("Error activando notificaciones:", error);
          toast({
              variant: "destructive",
              title: "Error al activar los avisos",
              description: String(error?.message || error).slice(0, 140),
          });
      }
  };

  const handleNotificationClick = async (notification: any) => {
    setOpen(false); 
    
    // 1. Marcar como leída
    if (!notification.read && firestore) {
      try {
        await updateDoc(doc(firestore, 'notifications', notification.id), { read: true });
      } catch (e) { console.error(e); }
    }

    // 2. LÓGICA DE REDIRECCIÓN INTELIGENTE 🧠
    // Avisos de plata (retiro pagado o rechazado) → la billetera del rol.
    // OJO: esto apuntaba a `/orders?tab=wallet`, una pestaña que ya NO EXISTE — se eliminó de
    // los paneles operativos en las Fases P y R porque mostraba números fantasma. La
    // billetera real vive en su propia ruta. El link llega en la notificación
    // (`notify-server.ts`), acá solo queda el fallback por rol para las viejas.
    if (notification.type === 'payout_received' || notification.type === 'payout_rejected') {
        if (notification.link) router.push(notification.link);
        else if (userProfile?.role === 'store') router.push('/my-store/wallet');
        else if (userProfile?.role === 'delivery') router.push('/delivery/earnings');
        return;
    }

    // Si tiene un ID de orden, vamos al detalle
    if (notification.orderId) {
        router.push(`/orders/${notification.orderId}`);
    } else if (notification.link) {
        router.push(notification.link);
    }
  };

  const handleClearAll = async () => {
      if (!firestore || localNotifications.length === 0) return;
      try {
          const batch = writeBatch(firestore);
          localNotifications.forEach((n: any) => {
              const ref = doc(firestore, 'notifications', n.id);
              batch.delete(ref);
          });
          await batch.commit();
          toast({ title: "Notificaciones borradas" });
      } catch (error) { console.error(error); }
  };

  const getIcon = (type: string) => {
      switch(type) {
          case 'payout_received': return <Wallet className="h-4 w-4 text-green-600" />;
          case 'order_paid': 
          case 'payment_success': return <DollarSign className="h-4 w-4 text-green-600" />;
          case 'order_status': return <Package className="h-4 w-4 text-blue-500" />;
          case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
          case 'alert': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
          case 'delivery': return <Truck className="h-4 w-4 text-orange-500" />;
          default: return <Info className="h-4 w-4 text-gray-500" />;
      }
  }

  const getTimeAgo = (timestamp: any) => {
      if (!timestamp) return '';
      try {
          const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
          return formatDistanceToNow(date, { addSuffix: true, locale: es });
      } catch (e) { return ''; }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-red-600 text-[10px] text-white font-bold animate-pulse">
                {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b bg-muted/20">
            <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold">Notificaciones</span>
                <div className="flex items-center gap-2">
                    {unreadCount > 0 && <Badge variant="secondary" className="text-[10px] h-5">{unreadCount} nuevas</Badge>}
                    {localNotifications.length > 0 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-500" onClick={handleClearAll} title="Borrar todas">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {permissionStatus === 'default' && (
                // OJO: nada de bg-blue-50/text-blue-700 — son colores de tema claro y en el
                // tema oscuro el botón se veía gris lavado, como deshabilitado (captura de
                // la prueba del APK, 15/8). Tokens semánticos del tema, como el resto.
                <Button
                    variant="outline" size="sm"
                    className="w-full mt-2 h-8 text-xs border-info/40 bg-info/10 text-info hover:bg-info/20 hover:text-info"
                    onClick={handleEnableNotifications}
                >
                    <BellRing className="mr-2 h-3 w-3" /> Activar Avisos Push
                </Button>
            )}
        </div>

        <ScrollArea className="h-[300px]">
          {!localNotifications || localNotifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No tienes notificaciones.
            </div>
          ) : (
            <div className="flex flex-col">
              {localNotifications.map((notif: any) => (
                <button
                  key={notif.id}
                  className={`flex items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors border-b last:border-0 ${!notif.read ? 'bg-blue-50/40' : ''}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="mt-1 bg-white p-2 rounded-full border shadow-sm shrink-0">
                    {getIcon(notif.type)}
                  </div>
                  <div className="space-y-1 w-full">
                    <p className={`text-sm ${!notif.read ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                      {notif.body || notif.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 first-letter:uppercase">
                      {getTimeAgo(notif.createdAt)}
                    </p>
                  </div>
                  {!notif.read && <div className="h-2 w-2 rounded-full bg-blue-500 mt-2 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}