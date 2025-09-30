'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Order } from '@/lib/order-service';
import { initialPrototypeOrders, PROTOTYPE_ORDERS_KEY, prototypeStore, prototypeUsers } from '@/lib/placeholder-data';

interface PrototypeDataContextType {
    prototypeOrders: Order[];
    loading: boolean;
    updatePrototypeOrder: (orderId: string, updates: Partial<Order>) => void;
    createPrototypeOrder: (orderData: Omit<Order, 'id' | 'createdAt'>) => void;
    getOrdersByStore: (storeId: string) => Order[];
    getAvailableOrdersForDelivery: () => Order[];
    getOrdersByDeliveryPerson: (driverId: string) => Order[];
    getOrderById: (orderId: string) => Order | undefined;
}

const PrototypeDataContext = createContext<PrototypeDataContextType | undefined>(undefined);

export const PrototypeDataProvider = ({ children }: { children: ReactNode }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (isClient) {
            try {
                const storedOrders = sessionStorage.getItem(PROTOTYPE_ORDERS_KEY);
                if (storedOrders) {
                    const parsedOrders = JSON.parse(storedOrders, (key, value) => {
                        if (key === 'createdAt') return new Date(value);
                        return value;
                    });
                    setOrders(parsedOrders);
                } else {
                    sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(initialPrototypeOrders));
                    setOrders(initialPrototypeOrders);
                }
            } catch (error) {
                console.error("Failed to load prototype orders from session storage, resetting.", error);
                sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(initialPrototypeOrders));
                setOrders(initialPrototypeOrders);
            } finally {
                setLoading(false);
            }
        }
    }, [isClient]);

    const updateSessionStorage = (updatedOrders: Order[]) => {
        sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(updatedOrders));
    };

    const updatePrototypeOrder = (orderId: string, updates: Partial<Order>) => {
        setOrders(prevOrders => {
            const updatedOrders = prevOrders.map(order => 
                order.id === orderId ? { ...order, ...updates } : order
            );
            updateSessionStorage(updatedOrders);
            return updatedOrders;
        });
    };

    const createPrototypeOrder = (orderData: Omit<Order, 'id' | 'createdAt'>) => {
        const newOrder: Order = {
            ...orderData,
            id: `proto-order-${Date.now()}`,
            createdAt: new Date(),
        };
        setOrders(prevOrders => {
            const updatedOrders = [...prevOrders, newOrder];
            updateSessionStorage(updatedOrders);
            return updatedOrders;
        });
    };
    
    const getOrdersByStore = useCallback((storeId: string) => {
        return orders
            .filter(o => o.storeId === storeId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }, [orders]);

    const getAvailableOrdersForDelivery = useCallback(() => {
        return orders
            .filter(order => order.status === 'En preparación' && !order.deliveryPersonId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }, [orders]);

    const getOrdersByDeliveryPerson = useCallback((driverId: string) => {
        return orders
            .filter(order => order.deliveryPersonId === driverId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }, [orders]);

    const getOrderById = useCallback((orderId: string) => {
        return orders.find(o => o.id === orderId);
    }, [orders]);


    const value = {
        prototypeOrders: orders,
        loading: loading || !isClient,
        updatePrototypeOrder,
        createPrototypeOrder,
        getOrdersByStore,
        getAvailableOrdersForDelivery,
        getOrdersByDeliveryPerson,
        getOrderById
    };

    return (
        <PrototypeDataContext.Provider value={value}>
            {children}
        </PrototypeDataContext.Provider>
    );
};

export const usePrototypeData = () => {
    const context = useContext(PrototypeDataContext);
    if (context === undefined) {
        throw new Error('usePrototypeData must be used within a PrototypeDataProvider');
    }
    return context;
};
