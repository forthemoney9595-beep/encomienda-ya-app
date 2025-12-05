'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
// ✅ Importamos la nueva función para pedir permisos
import { useCollection, useFirestore, useMemoFirebase, requestNotificationPermission } from '@/lib/firebase';
import { collection, query, where, limit, doc, updateDoc, writeBatch } from 'firebase/firestore'; 
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Bell, CheckCircle2, AlertCircle, Package, Info, Truck, Trash2, BellRing } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export function Notifications() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  
  // Estado para saber si ya tenemos permisos
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

  // 1. Verificar estado actual de permisos al cargar
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermissionStatus(Notification.permission);
    }
  }, []);

  // Consulta simplificada
  const notifsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'notifications'),
      where('userId', '==', user.uid),
      limit(20)
    );
  }, [firestore, user?.uid]);

  const { data: rawNotifications } = useCollection<any>(notifsQuery);
  
  // Ordenamos en cliente para ver las más nuevas primero
  const notifications = (rawNotifications || []).sort((a: any, b: any) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
  });
  
  const unreadCount = notifications.filter((n: any) => !n.read).length;

  // ✅ 2. MANEJADOR: ACTIVAR NOTIFICACIONES CON LOGS
  const handleEnableNotifications = async () => {
      console.log("🔔 Botón presionado: Iniciando proceso de activación..."); 
      
      try {
          const token = await requestNotificationPermission();
          
          if (token && user && firestore) {
              console.log("💾 Guardando token en Firestore para usuario:", user.uid);
              
              await updateDoc(doc(firestore, 'users', user.uid), { 
                  fcmToken: token,
                  notificationsEnabled: true
              });
              
              console.log("✅ Guardado en Firestore completado con éxito.");
              setPermissionStatus('granted'); // Actualizamos UI para ocultar botón
              
              toast({ 
                  title: "¡Notificaciones Activadas!", 
                  description: "Te avisaremos cuando haya novedades en tu pedido.",
                  className: "bg-green-50 border-green-200 text-green-900"
              });
          } else {
              console.error("❌ Fallo: No se obtuvo token o no hay usuario activo.");
              // Si el usuario ya dio permiso pero el token falló, actualizamos la UI para que no moleste
              if (Notification.permission === 'granted') {
                  console.log("ℹ️ Permiso concedido, ocultando botón aunque token falló.");
                  setPermissionStatus('granted'); 
              }
          }
      } catch (error) {
          console.error("❌ Error CRÍTICO en handleEnableNotifications:", error);
          toast({ variant: 'destructive', title: "Error", description: "Revisa la consola (F12) para más detalles." });
      }
  };

  const handleNotificationClick = async (notification: any) => {
    setOpen(false); 
    
    if (!notification.read && firestore) {
      try {
        await updateDoc(doc(firestore, 'notifications', notification.id), { read: true });
      } catch (e) { console.error("Error marcando leída", e); }
    }

    if (notification.orderId) {
        router.push(`/orders/${notification.orderId}`);
    } else {
        router.push('/orders');
    }
  };

  const handleClearAll = async () => {
      if (!firestore || notifications.length === 0) return;
      
      try {
          const batch = writeBatch(firestore);
          notifications.forEach((n: any) => {
              const ref = doc(firestore, 'notifications', n.id);
              batch.delete(ref);
          });
          await batch.commit();
          toast({ title: "Notificaciones borradas" });
      } catch (error) {
          console.error("Error borrando:", error);
      }
  };

  const getIcon = (type: string) => {
      switch(type) {
          case 'order_status': return <Package className="h-4 w-4 text-blue-500" />;
          case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
          case 'alert': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
          case 'delivery': return <Truck className="h-4 w-4 text-orange-500" />;
          default: return <Info className="h-4 w-4 text-gray-500" />;
      }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-600 border-2 border-background animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b bg-muted/20">
            <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold">Notificaciones</span>
                <div className="flex items-center gap-2">
                    {unreadCount > 0 && <Badge variant="secondary" className="text-[10px] h-5">{unreadCount} nuevas</Badge>}
                    {notifications.length > 0 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-500" onClick={handleClearAll} title="Borrar todas">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* ✅ BOTÓN PARA ACTIVAR NOTIFICACIONES (Solo si no están activas) */}
            {permissionStatus === 'default' && (
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 mt-2 h-8 text-xs"
                    onClick={handleEnableNotifications}
                >
                    <BellRing className="mr-2 h-3 w-3" />
                    Activar Avisos Push
                </Button>
            )}
        </div>

        <ScrollArea className="h-[300px]">
          {!notifications || notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No tienes notificaciones.
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((notif: any) => (
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
                      {notif.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Hace un momento
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