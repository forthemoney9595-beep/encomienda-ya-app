'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Order, OrderStatus } from '@/lib/order-service';
import { useAuth } from '@/context/auth-context';
// Importamos las funciones necesarias para la paginación
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { collection, query, where, CollectionReference, Timestamp, orderBy, limit, startAfter, QueryDocumentSnapshot, getDocs } from 'firebase/firestore';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button'; // Aseguramos que Button está importado

// Constante para el tamaño de la página
const PAGE_SIZE = 10;

const getBadgeVariant = (status: OrderStatus) => {
    switch (status) {
      case 'Entregado':
        return 'secondary';
      case 'En reparto':
        return 'default';
      case 'Pendiente de Pago':
        return 'outline';
      case 'En preparación':
        return 'outline';
      case 'Pendiente de Confirmación':
        return 'default'; 
      case 'Cancelado':
      case 'Rechazado':
        return 'destructive';
      default:
        return 'outline';
    }
};

// Función auxiliar para formatear fechas de forma segura
const formatDate = (date: Date | Timestamp | string | number | undefined) => {
    if (!date) return 'Fecha desconocida';
    
    try {
        let dateObj: Date;
        if (typeof date === 'object' && 'toDate' in date && typeof (date as any).toDate === 'function') {
             dateObj = (date as Timestamp).toDate();
        } else {
             dateObj = new Date(date as any);
        }

        if (isNaN(dateObj.getTime())) {
            return 'Fecha inválida';
        }

        return format(dateObj, "d MMM, HH:mm", { locale: es });
    } catch (error) {
        return 'Error en fecha';
    }
};

export default function StoreOrdersView() {
    const router = useRouter();
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();

    const [allOrders, setAllOrders] = useState<Order[]>([]);
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<Order> | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const storeId = userProfile?.storeId;

    // Función para construir la consulta (Query)
    const buildQuery = useCallback((startAfterDoc: QueryDocumentSnapshot<Order> | null) => {
        if (!firestore || !storeId) return null;

        let baseQuery = query(
            collection(firestore, 'orders') as CollectionReference<Order>,
            where('storeId', '==', storeId),
            orderBy('createdAt', 'desc'), 
            limit(PAGE_SIZE)
        );

        if (startAfterDoc) {
            baseQuery = query(baseQuery, startAfter(startAfterDoc));
        }

        return baseQuery;
    }, [firestore, storeId]);


    // Función para cargar los datos iniciales o más datos
    const loadOrders = useCallback(async (isLoadMore: boolean = false) => {
        if (!storeId || !firestore) return;
        
        const currentQuery = buildQuery(isLoadMore ? lastDoc : null);
        if (!currentQuery) return;
        
        isLoadMore ? setIsLoadingMore(true) : setIsInitialLoading(true);

        try {
            const snapshot = await getDocs(currentQuery);
            
            // Mapeo seguro, asegurando que el ID de Firestore es el ID canónico
            const newOrders = snapshot.docs.map(doc => ({ 
                ...doc.data(), 
                id: doc.id 
            })) as Order[];
            
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
    }, [firestore, storeId, buildQuery, lastDoc]);

    // Carga inicial al montar
    useEffect(() => {
        if (storeId && firestore) {
            loadOrders(false);
        }
    }, [storeId, firestore]); 

    // Función para refrescar (reinicia la paginación)
    const handleRefresh = () => {
        setAllOrders([]);
        setLastDoc(null);
        setHasMore(true);
        loadOrders(false);
    };

    const isLoading = authLoading || isInitialLoading;

    const handleRowClick = (orderId: string) => {
        router.push(`/orders/${orderId}`);
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Pedidos Entrantes</CardTitle>
                    <CardDescription>Cargando datos de la tienda...</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    const displayOrders = allOrders.slice(0, 100); // Mostrar máximo 100 pedidos en total por rendimiento

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pedidos Entrantes</CardTitle>
            <CardDescription>Aquí están los pedidos que tu tienda ha recibido.</CardDescription>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={isLoadingMore}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refrescar
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido ID</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!displayOrders || displayOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    Aún no has recibido ningún pedido.
                  </TableCell>
                </TableRow>
              ) : (
                displayOrders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => handleRowClick(order.id)}>
                    <TableCell className="font-medium">#{order.id.substring(0, 7)}</TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>{formatDate(order.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={getBadgeVariant(order.status)}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold">${(order.total || 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          {/* Botón de Cargar Más (Paginación Infinita) */}
          {hasMore && displayOrders.length > 0 && (
            <div className="p-4 pt-6">
                <Button 
                    onClick={() => loadOrders(true)} 
                    disabled={isLoadingMore}
                    variant="secondary"
                    className="w-full"
                >
                    {isLoadingMore ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {isLoadingMore ? "Cargando..." : "Cargar más pedidos..."}
                </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
}