'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Order, OrderStatus } from '@/lib/order-service';
import { useAuth } from '@/context/auth-context';
// Importamos los hooks de Firestore necesarios
import { useCollection, useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
// Importamos firestore
import { collection, query, where, CollectionReference, Timestamp, orderBy, limit, startAfter, QueryDocumentSnapshot, getDocs } from 'firebase/firestore';
import { Package, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback } from 'react';

// Constante para el tamaño de la página
const PAGE_SIZE = 10;

const getBadgeVariant = (status: OrderStatus) => {
    switch (status) {
      case 'Entregado': return 'secondary';
      case 'En reparto': return 'default';
      case 'Pendiente de Pago': return 'outline'; 
      case 'En preparación': return 'outline';
      case 'Pendiente de Confirmación': return 'default'; 
      case 'Cancelado':
      case 'Rechazado': return 'destructive';
      default: return 'outline';
    }
  };

// Función auxiliar robusta para formatear fechas
const formatDate = (date: any) => {
    if (!date) return 'Fecha desconocida';
    try {
        let dateObj: Date;
        if (typeof date === 'object' && typeof date.toDate === 'function') {
             dateObj = date.toDate();
        } else if (typeof date === 'string' || typeof date === 'number') {
             dateObj = new Date(date);
        } else if (date instanceof Date) {
            dateObj = date;
        } else {
            return 'Fecha inválida';
        }
        if (isNaN(dateObj.getTime())) return 'Fecha inválida';
        return format(dateObj, "d MMM, HH:mm", { locale: es });
    } catch (error) {
        return 'Error fecha';
    }
};

export default function BuyerOrdersView() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const firestore = useFirestore();

    const [allOrders, setAllOrders] = useState<Order[]>([]);
    // Especificamos el tipo para el QueryDocumentSnapshot
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<Order> | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    
    // Función para construir la consulta (Query)
    const buildQuery = useCallback((startAfterDoc: QueryDocumentSnapshot<Order> | null) => {
        if (!firestore || !user) return null;

        let baseQuery = query(
            collection(firestore, 'orders') as CollectionReference<Order>,
            where('userId', '==', user.uid),
            // Importante: Ordenar por un campo indexado (se recomienda createdAt)
            orderBy('createdAt', 'desc'), 
            limit(PAGE_SIZE)
        );

        if (startAfterDoc) {
            baseQuery = query(baseQuery, startAfter(startAfterDoc));
        }

        return baseQuery;
    }, [firestore, user]);


    // Función para cargar los datos iniciales o más datos
    const loadOrders = useCallback(async (isLoadMore: boolean = false) => {
        if (!user || !firestore) return;
        
        const currentQuery = buildQuery(isLoadMore ? lastDoc : null);
        if (!currentQuery) return;
        
        isLoadMore ? setIsLoadingMore(true) : setIsInitialLoading(true);

        try {
            const snapshot = await getDocs(currentQuery);
            
            // ✅ CORRECCIÓN 1: Se usa el spread operator ANTES del ID para asegurar que el doc.id de Firestore prevalezca.
            const newOrders = snapshot.docs.map(doc => { 
                return { 
                    ...doc.data(), // Esparcimos los datos del documento (incluido el ID si existe en los datos)
                    id: doc.id,     // Forzamos la sobreescritura con el ID canónico de Firestore
                }
            }) as Order[];
            
            // Si no vinieron documentos, ya no hay más para cargar
            if (newOrders.length === 0 || newOrders.length < PAGE_SIZE) {
                setHasMore(false);
            }
            
            if (isLoadMore) {
                setAllOrders(prev => [...prev, ...newOrders]);
            } else {
                // Carga inicial
                setAllOrders(newOrders);
            }

            // Actualizar el último documento si hay datos
            if (snapshot.docs.length > 0) {
                setLastDoc(snapshot.docs[snapshot.docs.length - 1] as QueryDocumentSnapshot<Order>);
            }

        } catch (error) {
            console.error("Error al cargar pedidos:", error);
        } finally {
            isLoadMore ? setIsLoadingMore(false) : setIsInitialLoading(false);
        }
    }, [user, firestore, buildQuery, lastDoc]);

    // Carga inicial al montar
    useEffect(() => {
        if (user && firestore) {
            loadOrders(false);
        }
    }, [user, firestore]); // Solo se ejecuta al iniciar sesión o cargar Firestore

    // Función para refrescar (reinicia la paginación)
    const handleRefresh = () => {
        setAllOrders([]);
        setLastDoc(null);
        setHasMore(true);
        loadOrders(false);
    };


    const isLoading = authLoading || isInitialLoading;

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    return (
      <div className="space-y-6">
          <div className="flex justify-end">
              <Button variant="outline" onClick={handleRefresh} disabled={isLoadingMore}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Refrescar Lista
              </Button>
          </div>

        {!allOrders || allOrders.length === 0 ? (
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="bg-muted rounded-full p-4 mb-4">
                        <Package className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">Aún no has realizado ningún pedido.</h3>
                    <p className="text-sm text-muted-foreground mt-2 mb-6">
                        ¡Explora las tiendas y encuentra algo que te guste!
                    </p>
                    <Button onClick={() => router.push('/')}>Explorar Tiendas</Button>
                </CardContent>
            </Card>
        ) : (
            <div className="grid gap-4">
                {allOrders.map((order) => {
                    const displayTotal = order.total || order.items.reduce((sum, item) => sum + item.price * item.quantity, 0) + order.deliveryFee;

                    return (
                        <Card key={order.id} className="overflow-hidden transition-all hover:shadow-md cursor-pointer" onClick={() => router.push(`/orders/${order.id}`)}>
                            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 bg-muted/30">
                                <div className="space-y-1">
                                    <CardTitle className="text-base font-medium">
                                        {order.storeName}
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Pedido #{order.id.substring(0, 7)} • {formatDate(order.createdAt)}
                                    </CardDescription>
                                </div>
                                <Badge variant={getBadgeVariant(order.status)}>{order.status}</Badge>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="flex justify-between items-center">
                                    <div className="text-sm text-muted-foreground">
                                        {order.items.length} artículo{order.items.length !== 1 && 's'}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-lg">${displayTotal.toFixed(2)}</span>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="p-2 pt-0">
                                {/* Opcional: Mostrar la dirección de entrega de forma discreta */}
                                <p className="text-xs text-muted-foreground truncate w-full px-2">
                                    Entrega en: {order.shippingAddress?.address || 'Dirección no disponible'}
                                </p>
                            </CardFooter>
                        </Card>
                    );
                })}

                {/* Botón de Cargar Más (Paginación Infinita) */}
                {hasMore && (
                    <Button 
                        onClick={() => loadOrders(true)} 
                        disabled={isLoadingMore}
                        variant="secondary"
                        className="w-full mt-4"
                    >
                        {isLoadingMore ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        {isLoadingMore ? "Cargando..." : "Cargar más pedidos..."}
                    </Button>
                )}
            </div>
        )}
      </div>
    );
}