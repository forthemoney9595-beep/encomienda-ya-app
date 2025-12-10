'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase, requestNotificationPermission } from '@/lib/firebase';
import { collection, query, where, limit, doc, updateDoc, writeBatch, orderBy, onSnapshot } from 'firebase/firestore'; 
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Bell, CheckCircle2, AlertCircle, Package, Info, Truck, Trash2, BellRing, DollarSign } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export function Notifications() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [localNotifications, setLocalNotifications] = useState<any[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

  // 1. Estado de Permisos
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermissionStatus(Notification.permission);
    }
  }, []);

  // 2. LISTENER EN TIEMPO REAL MANUAL (Más robusto que useCollection para este caso)
  useEffect(() => {
    if (!firestore || !user?.uid) return;

    // Creamos la query
    const q = query(
        collection(firestore, 'notifications'),
        where('userId', '==', user.uid),
        // orderBy('createdAt', 'desc'), // A veces falla si falta índice, lo ordenamos en cliente mejor
        limit(20)
    );

    console.log("🔔 [Notificaciones] Iniciando escucha para usuario:", user.uid);

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Ordenamiento en cliente (Más seguro sin índices compuestos)
        notifs.sort((a: any, b: any) => {
            const dateA = a.createdAt?.seconds || 0;
            const dateB = b.createdAt?.seconds || 0;
            return dateB - dateA; // Más nuevo primero
        });

        console.log("🔔 [Notificaciones] Recibidas:", notifs.length);
        setLocalNotifications(notifs);
    }, (error) => {
        console.error("❌ [Notificaciones] Error escuchando:", error);
    });

    return () => unsubscribe();
  }, [firestore, user?.uid]);
  
  const unreadCount = localNotifications.filter((n: any) => !n.read).length;

  const handleEnableNotifications = async () => {
      try {
          const token = await requestNotificationPermission();
          if (token && user && firestore) {
              await updateDoc(doc(firestore, 'users', user.uid), { 
                  fcmToken: token,
                  notificationsEnabled: true
              });
              setPermissionStatus('granted');
              toast({ title: "¡Notificaciones Activadas!", className: "bg-green-50 text-green-900" });
          }
      } catch (error) {
          console.error("Error activando notificaciones:", error);
      }
  };

  const handleNotificationClick = async (notification: any) => {
    setOpen(false); 
    
    if (!notification.read && firestore) {
      try {
        await updateDoc(doc(firestore, 'notifications', notification.id), { read: true });
      } catch (e) { console.error(e); }
    }

    if (notification.orderId) {
        router.push(`/orders/${notification.orderId}`);
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
                <Button 
                    variant="outline" size="sm" 
                    className="w-full bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 mt-2 h-8 text-xs"
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