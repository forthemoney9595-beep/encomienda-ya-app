'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useFirestore, requestNotificationPermission, persistFcmToken } from '@/lib/firebase';
import { collection, query, where, limit, doc, updateDoc, writeBatch, orderBy, onSnapshot, arrayUnion } from 'firebase/firestore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Bell, CheckCircle2, AlertCircle, Package, Info, Truck, Trash2, BellRing, DollarSign, Wallet } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  // 1. Estado de Permisos — se re-lee también cada vez que se ABRE la campanita: si el
  // permiso se concedió por otro camino (el pedido automático del login, o Ajustes de
  // Android), el botón "Activar Avisos Push" seguía mostrándose con el estado viejo.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermissionStatus(Notification.permission);
    }
  }, [open]);

  // 1b. Refuerzo (caso real de la prueba del APK, 15/8): si el permiso se activó desde
  // Ajustes de Android A MITAD de sesión, el registro automático del login ya pasó y el
  // token de ESTE dispositivo queda sin guardar hasta el próximo arranque en frío — o
  // sea, sin push aunque todo diga que está activo. Al abrir la campanita con permiso
  // concedido, se asegura el token en silencio (solo escribe si falta).
  useEffect(() => {
    if (!open || !user || !firestore) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    (async () => {
        try {
            const { token, error } = await requestNotificationPermission(); // con permiso ya concedido no muestra ningún diálogo
            if (token) {
                setRegistrationError(null);
                if (!((userProfile as any)?.fcmTokens || []).includes(token)) {
                    await persistFcmToken(user.uid, token);
                }
            } else {
                // Permiso concedido pero el registro falla: SIN esto era invisible (el
                // celular de la prueba del 15/8 quedaba "en verde" pero sin token — y
                // por lo tanto sin ningún push — sin que nada lo dijera).
                setRegistrationError(error || 'motivo desconocido');
            }
        } catch (e: any) {
            setRegistrationError(String(e?.message || e));
        }
    })();
  }, [open, user, firestore, userProfile]);

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
        console.error("[Notificaciones] Error escuchando:", error);
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
              // Punto ÚNICO de guardado (persistFcmToken): fcmToken + fcmTokens + el
              // reemplazo del token viejo de este dispositivo (anti push duplicado).
              try {
                  await persistFcmToken(user.uid, token);
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
          } else if (error && error.includes('permission-blocked')) {
              // Caso real visto en la prueba del APK (15/8): Android 13 bloquea el permiso
              // del SISTEMA para siempre tras un par de rechazos, aunque el del sitio se
              // acepte — el diálogo ya no vuelve a salir, hay que ir a Ajustes.
              toast({
                  variant: "destructive",
                  title: "Bloqueadas por Android",
                  description: "Android bloqueó las notificaciones de la app. Activalas en Ajustes → Aplicaciones → EncomiendaYA → Notificaciones, y tocá este botón de nuevo.",
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
          case 'payout_received': return <Wallet className="h-4 w-4 text-success" />;
          case 'order_paid': 
          case 'payment_success': return <DollarSign className="h-4 w-4 text-success" />;
          case 'order_status': return <Package className="h-4 w-4 text-info" />;
          case 'success': return <CheckCircle2 className="h-4 w-4 text-success" />;
          case 'alert': return <AlertCircle className="h-4 w-4 text-warning" />;
          case 'delivery': return <Truck className="h-4 w-4 text-offer" />;
          default: return <Info className="h-4 w-4 text-muted-foreground" />;
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
        <Button variant="ghost" size="icon" className="relative h-11 w-11 rounded-[0.875rem]" aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones"}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground ring-2 ring-background motion-safe:animate-pulse" aria-hidden="true">
                {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      {/* Panel de vidrio (rediseño 9/11/2026). El PopoverContent queda transparente y el vidrio
          va adentro: `glass-strong` vive en @layer components y el bg-popover del Popover lo pisaría. */}
      <PopoverContent align="end" sideOffset={10} className="w-[min(24rem,calc(100vw-1.5rem))] rounded-card border-0 bg-transparent p-0 shadow-none">
        <div data-testid="notif-panel" className="glass-strong overflow-hidden rounded-card">
        <div className="border-b border-foreground/10 p-4">
            <div className="flex items-center justify-between gap-2">
                <h2 className="font-headline text-xl font-bold leading-none">Notificaciones</h2>
                <div className="flex items-center gap-1.5">
                    {unreadCount > 0 && (
                        <span className="inline-flex h-7 items-center rounded-full bg-info/15 px-2.5 text-sm font-semibold text-info">{unreadCount} nuevas</span>
                    )}
                    {localNotifications.length > 0 && (
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={handleClearAll} aria-label="Borrar todas las notificaciones" title="Borrar todas">
                            <Trash2 className="h-5 w-5" />
                        </Button>
                    )}
                </div>
            </div>

            {permissionStatus === 'default' && (
                // OJO: nada de bg-blue-50 — en el tema oscuro el botón se veía gris lavado,
                // como deshabilitado (captura de la prueba del APK, 15/8). Tokens del tema.
                <Button
                    variant="outline"
                    data-testid="notif-enable"
                    className="mt-3 h-11 w-full rounded-2xl border-info/40 bg-info/10 text-sm font-semibold text-info hover:bg-info/20 hover:text-info"
                    onClick={handleEnableNotifications}
                >
                    <BellRing className="h-5 w-5" /> Activar avisos en este dispositivo
                </Button>
            )}
            {permissionStatus === 'granted' && registrationError && (
                <div data-testid="notif-register-error" role="status" className="mt-3 w-full rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm leading-snug text-warning">
                    Permiso OK, pero el registro del dispositivo falla: {registrationError}
                </div>
            )}
            {permissionStatus === 'denied' && (
                // Estado que antes era INVISIBLE y se confundía con "aceptado" (prueba del
                // APK, 15/8): con el permiso denegado no se mostraba nada. Ahora se ve y
                // explica cómo destrabarlo (el permiso del SITIO se maneja en Chrome).
                <button
                    type="button"
                    data-testid="notif-blocked"
                    onClick={() => toast({
                        title: "Cómo desbloquear los avisos",
                        description: "En el celular: abrí Chrome → entrá a encomienda-ya-app.vercel.app → tocá el candado junto a la dirección → Permisos → Notificaciones → Permitir. Después cerrá y reabrí la app. En PC: mismo candado junto a la dirección.",
                        duration: 15000,
                    })}
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-left text-sm font-medium leading-snug text-warning transition-colors hover:bg-warning/20"
                >
                    <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                    Avisos bloqueados en este dispositivo — tocá para ver cómo activarlos
                </button>
            )}
        </div>

          {!localNotifications || localNotifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/5 text-muted-foreground">
                <Bell className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="text-base text-muted-foreground">Todavía no tenés notificaciones.</p>
            </div>
          ) : (
          <ScrollArea className="h-[min(26rem,58vh)]">
            <ul className="flex flex-col gap-1 p-2">
              {localNotifications.map((notif: any) => (
                <li key={notif.id}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors duration-200 hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${!notif.read ? 'bg-info/10' : ''}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/80 shadow-sm [&_svg]:h-5 [&_svg]:w-5">
                    {getIcon(notif.type)}
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className={`block text-base leading-snug ${!notif.read ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {notif.title}
                    </span>
                    <span className="block text-sm leading-snug text-muted-foreground line-clamp-2">
                      {notif.body || notif.message}
                    </span>
                    <span className="block pt-0.5 text-xs text-muted-foreground first-letter:uppercase">
                      {getTimeAgo(notif.createdAt)}
                    </span>
                  </span>
                  {!notif.read && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-info" aria-hidden="true" />}
                  {!notif.read && <span className="sr-only">(sin leer)</span>}
                </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
