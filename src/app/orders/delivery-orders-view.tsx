'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import { collection, query, where, orderBy, doc, updateDoc, limit, startAfter, QueryDocumentSnapshot, getDocs, CollectionReference } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MapPin, Package, Bike, CheckCircle, Navigation, Clock, ArrowRight, Loader2, RefreshCw, Map, ExternalLink, Banknote, CreditCard, AlertTriangle, BellRing } from 'lucide-react';
import { Order } from '@/lib/order-service';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const PAGE_SIZE = 10;

export default function DeliveryOrdersView() {
  const { user, userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // --- ESTADOS DE PAGINACIÓN ---
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [availableLastDoc, setAvailableLastDoc] = useState<QueryDocumentSnapshot<Order> | null>(null);
  const [availableHasMore, setAvailableHasMore] = useState(true);
  const [loadingAvailable, setLoadingAvailable] = useState(true);
  const [isLoadingAvailableMore, setIsLoadingAvailableMore] = useState(false);

  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [activeLastDoc, setActiveLastDoc] = useState<QueryDocumentSnapshot<Order> | null>(null);
  const [activeHasMore, setActiveHasMore] = useState(true);
  const [loadingActive, setLoadingActive] = useState(true);
  const [isLoadingActiveMore, setIsLoadingActiveMore] = useState(false);
  
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]); 
  const [loadingHistory, setLoadingHistory] = useState(true);

  // --- CONSULTAS ---

  const buildAvailableQuery = useCallback((startAfterDoc: QueryDocumentSnapshot<Order> | null) => {
    if (!firestore) return null;
    // Consulta: Pedidos sin repartidor y que estén en preparación
    let baseQuery = query(
      collection(firestore, 'orders') as CollectionReference<Order>,
      where('status', '==', 'En preparación'), 
      where('deliveryPersonId', '==', null), 
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
    if (startAfterDoc) {
      baseQuery = query(baseQuery, startAfter(startAfterDoc));
    }
    return baseQuery;
  }, [firestore]);

  const buildActiveQuery = useCallback((startAfterDoc: QueryDocumentSnapshot<Order> | null) => {
    if (!firestore || !user) return null;
    let baseQuery = query(
      collection(firestore, 'orders') as CollectionReference<Order>,
      where('deliveryPersonId', '==', user.uid),
      where('status', 'in', ['En preparación', 'En reparto']), // Quitamos 'En camino' si no se usa
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );
    if (startAfterDoc) {
      baseQuery = query(baseQuery, startAfter(startAfterDoc));
    }
    return baseQuery;
  }, [firestore, user]);
  
  const buildHistoryQuery = useCallback(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'orders') as CollectionReference<Order>,
      where('deliveryPersonId', '==', user.uid),
      where('status', '==', 'Entregado'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
  }, [firestore, user]);


  // --- FUNCIONES DE CARGA ---
  
  const loadOrders = useCallback(async (
    queryBuilder: (doc: QueryDocumentSnapshot<Order> | null) => any,
    isLoadMore: boolean,
    setState: React.Dispatch<React.SetStateAction<Order[]>>,
    setLastDoc: React.Dispatch<React.SetStateAction<QueryDocumentSnapshot<Order> | null>>,
    setHasMore: React.Dispatch<React.SetStateAction<boolean>>,
    setLoadingState: React.Dispatch<React.SetStateAction<boolean>>,
    specificLastDoc: QueryDocumentSnapshot<Order> | null 
  ) => {
    const currentQuery = queryBuilder(isLoadMore ? specificLastDoc : null);
    if (!currentQuery) return;

    if (!isLoadMore) setLoadingState(true);

    try {
      const snapshot = await getDocs(currentQuery);
      
      const newOrders: Order[] = snapshot.docs.map(doc => {
        const data = doc.data() as any; 
        return { ...data, id: doc.id };
      });
      
      if (newOrders.length === 0 || newOrders.length < PAGE_SIZE) {
        setHasMore(false);
      }
      
      // @ts-ignore
      setState((prev: Order[]) => { 
          const safePrev = Array.isArray(prev) ? prev : []; 
          return isLoadMore ? safePrev.concat(newOrders) : newOrders;
      });

      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] as QueryDocumentSnapshot<Order>);
      }
    } catch (error) {
      console.error("Error al cargar pedidos:", error);
      // Si falla por índice, suele ser un error de consola.
      // Verifica en la consola de Firebase si necesitas crear un índice compuesto.
      setHasMore(false); 
    } finally {
      setLoadingState(false);
    }
  }, []); 


  // Carga del Historial
  useEffect(() => {
    const historyQuery = buildHistoryQuery();
    if (historyQuery) {
        setLoadingHistory(true);
        getDocs(historyQuery).then(snapshot => {
            const historyData = snapshot.docs.map(doc => {
                const data = doc.data() as any;
                return { ...data, id: doc.id };
            }) as Order[];
            setHistoryOrders(historyData);
            setLoadingHistory(false);
        });
    }
  }, [buildHistoryQuery]);


  // Carga Inicial
  useEffect(() => {
    if (firestore && user) {
      loadOrders(buildAvailableQuery, false, setAvailableOrders, setAvailableLastDoc, setAvailableHasMore, setLoadingAvailable, availableLastDoc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, user, buildAvailableQuery]); 

  useEffect(() => {
    if (firestore && user) {
      loadOrders(buildActiveQuery, false, setActiveOrders, setActiveLastDoc, setActiveHasMore, setLoadingActive, activeLastDoc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, user, buildActiveQuery]); 


  // --- HANDLERS ---
  
  const handleAcceptOrder = async (order: Order) => {
    if (!user || !firestore) return;
    setIsUpdating(order.id);
    try {
      const orderRef = doc(firestore, 'orders', order.id);
      
      // Al aceptar, te asignas como repartidor, pero el estado sigue 'En preparación'
      // hasta que TÚ decidas marcarlo como 'En reparto' (cuando lo recojas).
      // Si prefieres que pase directo a 'En reparto', cambia status aquí.
      // Mi recomendación: Mantener 'En preparación' hasta recoger.
      
      await updateDoc(orderRef, {
        deliveryPersonId: user.uid,
        deliveryPersonName: userProfile?.displayName || 'Repartidor',
        // status: 'En reparto' // Descomentar si quieres cambio inmediato
      });
      
      toast({ title: "¡Pedido Asignado!", description: "Ve a 'Mis Entregas' para ver los detalles." });
      
      setAvailableOrders(prev => prev.filter(o => o.id !== order.id));
      setActiveOrders(prev => [order, ...prev]);
      
      // Redirigir al detalle para iniciar el viaje
      router.push(`/orders/${order.id}`);

    } catch (error) {
      toast({ variant: 'destructive', title: "Error", description: "No se pudo aceptar el pedido." });
    } finally {
      setIsUpdating(null);
    }
  };
  
  const openMap = (address: string) => {
      if (!address) return;
      const encodedAddress = encodeURIComponent(address);
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
  };

  const formatFee = (fee: number | undefined) => {
    return fee ? `$${fee.toFixed(2)}` : '$0.00';
  }


  // --- RENDERIZADO ---
  
  const availableCount = availableOrders?.length || 0;
  const activeCount = activeOrders?.length || 0;
  const isGlobalLoading = loadingAvailable && loadingActive;

  if (isGlobalLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  return (
    <Tabs defaultValue={activeCount > 0 ? "active" : "available"} className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="available">
          Disponibles {availableHasMore && availableCount > 0 && <Badge variant="secondary" className="ml-2">{availableCount}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="active">
          Mis Entregas {activeCount > 0 && <Badge variant="secondary" className="ml-2">{activeCount}</Badge>}
        </TabsTrigger>
      </TabsList>

      {/* --- PESTAÑA: DISPONIBLES --- */}
      <TabsContent value="available" className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5" /> Pedidos esperando repartidor
        </h3>
        
        {availableCount === 0 && !loadingAvailable ? (
          <div className="text-center py-10 text-muted-foreground border rounded-lg bg-muted/10">
            <p>No hay pedidos disponibles en este momento.</p>
          </div>
        ) : (
          <>
          {availableOrders.map(order => (
            <Card key={order.id} className="overflow-hidden border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-3 bg-muted/20 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">{order.storeName}</CardTitle>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline">{order.status}</Badge>
                    {/* ✅ SI ESTÁ LISTO, MOSTRARLO EN ROJO LLAMATIVO */}
                    {(order as any).readyForPickup && (
                        <Badge variant="destructive" className="animate-pulse flex items-center gap-1">
                            <BellRing className="h-3 w-3" /> LISTO PARA RETIRAR
                        </Badge>
                    )}
                    <Badge variant="secondary" className="flex items-center gap-1">
                        <CreditCard className="h-3 w-3"/> Tarjeta
                    </Badge>
                  </div>
                </div>
                <Badge className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1">
                  Ganancia: {formatFee(order.deliveryFee)}
                </Badge>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-blue-500 mt-1 shrink-0" />
                    <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase">Recoger en Tienda</p>
                        <p className="text-sm font-medium">{order.storeName}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openMap(order.storeName)} title="Ver en Mapa">
                      <Map className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-red-500 mt-1 shrink-0" />
                    <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase">Entregar a Cliente</p>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                        {order.shippingInfo?.address || order.shippingAddress?.address || 'Dirección del cliente'}
                        </p>
                    </div>
                  </div>
                   <Button variant="ghost" size="sm" onClick={() => openMap(order.shippingInfo?.address || order.shippingAddress?.address || '')} title="Ver en Mapa">
                      <Map className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/10 pt-4">
                <Button 
                  className="w-full bg-green-600 hover:bg-green-700 text-white" 
                  onClick={() => handleAcceptOrder(order)}
                  disabled={isUpdating === order.id}
                >
                  {isUpdating === order.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Aceptar Pedido"}
                </Button>
              </CardFooter>
            </Card>
          ))}
          
          {availableHasMore && availableOrders.length > 0 && (
            <Button 
              onClick={() => loadOrders(buildAvailableQuery, true, setAvailableOrders, setAvailableLastDoc, setAvailableHasMore, setIsLoadingAvailableMore, availableLastDoc)} 
              disabled={isLoadingAvailableMore}
              variant="secondary"
              className="w-full mt-4"
            >
              {isLoadingAvailableMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {isLoadingAvailableMore ? "Cargando..." : "Cargar más disponibles..."}
            </Button>
          )}
          </>
        )}
      </TabsContent>

      {/* --- PESTAÑA: MIS ENTREGAS ACTIVAS --- */}
      <TabsContent value="active" className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-blue-600">
          <Bike className="h-5 w-5" /> En Curso
        </h3>

        {activeCount === 0 && !loadingActive ? (
          <div className="text-center py-10 text-muted-foreground border rounded-lg bg-muted/10">
            <p>No tienes entregas activas.</p>
            <Button variant="link" onClick={() => document.querySelector<HTMLElement>('[data-value="available"]')?.click()}>
              Buscar pedidos disponibles
            </Button>
          </div>
        ) : (
            <>
            {activeOrders.map(order => (
                <Card key={order.id} className="overflow-hidden border shadow-md border-blue-200">
                    <CardHeader className="pb-3 bg-blue-50 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-lg text-blue-900">{order.storeName}</CardTitle>
                            <CardDescription>Cliente: {order.customerName}</CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                             <Badge className="bg-blue-500">{order.status}</Badge>
                             {/* Alerta de Listo para Retirar */}
                             {(order as any).readyForPickup && order.status === 'En preparación' && (
                                <Badge variant="destructive" className="animate-pulse">¡RETIRAR YA!</Badge>
                             )}
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                        <div className="p-4 bg-white border rounded-md flex justify-between items-center cursor-pointer hover:bg-gray-50" onClick={() => openMap(order.shippingInfo?.address || '')}>
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-500 p-2 rounded-full text-white"><Navigation className="h-5 w-5"/></div>
                                <div><p className="text-xs text-blue-600 font-bold uppercase">Ir al Destino</p><p className="text-sm font-medium">{order.shippingInfo?.address}</p></div>
                            </div>
                            <ExternalLink className="h-4 w-4 text-gray-400"/>
                        </div>
                        
                        <div className="flex justify-between text-sm text-muted-foreground">
                            <span>Ganancia: <span className="font-semibold text-green-600">{formatFee(order.deliveryFee)}</span></span>
                        </div>
                    </CardContent>

                    <CardFooter className="grid grid-cols-1 gap-3 pt-2">
                        <Link href={`/orders/${order.id}`} className="w-full">
                            <Button className="w-full h-12 text-lg" variant="default">
                                Ver Detalles y Chat <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </Link>
                    </CardFooter>
                </Card>
            ))}
            {activeHasMore && activeOrders.length > 0 && (
                <Button 
                  onClick={() => loadOrders(buildActiveQuery, true, setActiveOrders, setActiveLastDoc, setActiveHasMore, setIsLoadingActiveMore, activeLastDoc)} 
                  disabled={isLoadingActiveMore}
                  variant="secondary"
                  className="w-full mt-4"
                >
                  {isLoadingActiveMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  {isLoadingActiveMore ? "Cargando..." : "Cargar más entregas activas..."}
                </Button>
            )}
            </>
        )}

        {/* HISTORIAL RÁPIDO */}
        {loadingHistory ? (
             <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : historyOrders && historyOrders.length > 0 && (
            <>
                <div className="my-6 border-t" />
                <h3 className="text-lg font-semibold flex items-center gap-2 text-muted-foreground">
                    <CheckCircle className="h-5 w-5" /> Completados Recientemente
                </h3>
                <div className="space-y-2 opacity-70">
                    {historyOrders.map(order => (
                        <Card key={order.id} className="p-3 bg-muted rounded-lg border flex justify-between items-center hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => router.push(`/orders/${order.id}`)}>
                            <div>
                                <p className="font-medium text-sm">{order.storeName}</p>
                                <p className="text-xs text-green-600 font-bold">Ganancia: {formatFee(order.deliveryFee)}</p>
                            </div>
                            <Badge variant="outline">Completado</Badge>
                        </Card>
                    ))}
                </div>
            </>
        )}
      </TabsContent>
    </Tabs>
  );
}