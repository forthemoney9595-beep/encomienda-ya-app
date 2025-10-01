
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Order } from '@/lib/order-service';
import { initialPrototypeOrders, PROTOTYPE_ORDERS_KEY, prototypeStore as initialPrototypeStore, initialPrototypeProducts } from '@/lib/placeholder-data';
import type { Store, Product } from '@/lib/placeholder-data';

interface PrototypeDataContextType {
    prototypeOrders: Order[];
    prototypeStore: Store;
    prototypeProducts: Product[];
    loading: boolean;
    updatePrototypeOrder: (orderId: string, updates: Partial<Order>) => void;
    addPrototypeOrder: (order: Order) => void;
    updatePrototypeProduct: (product: Product) => void;
    addPrototypeProduct: (product: Product) => void;
    deletePrototypeProduct: (productId: string) => void;
    updatePrototypeStore: (updates: Partial<Store>) => void;
    getOrdersByStore: (storeId: string) => Order[];
    getOrdersByUser: (userId: string) => Order[];
    getAvailableOrdersForDelivery: () => Order[];
    getOrdersByDeliveryPerson: (driverId: string) => Order[];
    getOrderById: (orderId: string) => Order | undefined;
}

const PrototypeDataContext = createContext<PrototypeDataContextType | undefined>(undefined);

const PROTOTYPE_STORE_KEY = 'prototypeStore';

export const PrototypeDataProvider = ({ children }: { children: ReactNode }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>(initialPrototypeProducts);
    const [prototypeStore, setPrototypeStore] = useState<Store>(initialPrototypeStore);
    const [loading, setLoading] = useState(true);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // Load and manage orders and store from session storage
    useEffect(() => {
        if (isClient) {
            try {
                // Orders
                const storedOrders = sessionStorage.getItem(PROTOTYPE_ORDERS_KEY);
                const loadedOrders = storedOrders 
                    ? JSON.parse(storedOrders, (key, value) => key === 'createdAt' ? new Date(value) : value)
                    : initialPrototypeOrders;
                 setOrders(loadedOrders);

                // Store
                const storedStore = sessionStorage.getItem(PROTOTYPE_STORE_KEY);
                const loadedStore = storedStore ? JSON.parse(storedStore) : initialPrototypeStore;
                setPrototypeStore(loadedStore);

            } catch (error) {
                console.error("Failed to load prototype data from session storage, resetting.", error);
                sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(initialPrototypeOrders));
                setOrders(initialPrototypeOrders);
                sessionStorage.setItem(PROTOTYPE_STORE_KEY, JSON.stringify(initialPrototypeStore));
                setPrototypeStore(initialPrototypeStore);
            } finally {
                setLoading(false);
            }
        }
    }, [isClient]);

    const updateOrdersInSession = (updatedOrders: Order[]) => {
        if (isClient) {
            sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(updatedOrders));
        }
    };
    
    const updateStoreInSession = (updatedStore: Store) => {
        if (isClient) {
            sessionStorage.setItem(PROTOTYPE_STORE_KEY, JSON.stringify(updatedStore));
        }
    };

    const updatePrototypeOrder = (orderId: string, updates: Partial<Order>) => {
        setOrders(prevOrders => {
            const updatedOrders = prevOrders.map(order => 
                order.id === orderId ? { ...order, ...updates } : order
            );
            updateOrdersInSession(updatedOrders);
            return updatedOrders;
        });
    };

    const addPrototypeOrder = (order: Order) => {
        setOrders(prevOrders => {
            const updatedOrders = [...prevOrders, order];
            updateOrdersInSession(updatedOrders);
            return updatedOrders;
        });
    };

    const updatePrototypeStore = (updates: Partial<Store>) => {
        setPrototypeStore(prevStore => {
            const updatedStore = { ...prevStore, ...updates };
            updateStoreInSession(updatedStore);
            return updatedStore;
        });
    };

    const addPrototypeProduct = (product: Product) => {
        setProducts(prev => [...prev, product]);
    }
    const updatePrototypeProduct = (productData: Product) => {
        setProducts(prev => prev.map(p => p.id === productData.id ? productData : p));
    }
    const deletePrototypeProduct = (productId: string) => {
        setProducts(prev => prev.filter(p => p.id !== productId));
    }
    
    const getOrdersByStore = useCallback((storeId: string) => {
        return orders
            .filter(o => o.storeId === storeId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [orders]);

    const getOrdersByUser = useCallback((userId: string) => {
        return orders
            .filter(o => o.userId === userId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [orders]);

    const getAvailableOrdersForDelivery = useCallback(() => {
        return orders
            .filter(order => order.status === 'En preparación' && !order.deliveryPersonId)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }, [orders]);

    const getOrdersByDeliveryPerson = useCallback((driverId: string) => {
        return orders
            .filter(order => order.deliveryPersonId === driverId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [orders]);

    const getOrderById = useCallback((orderId: string) => {
        return orders.find(o => o.id === orderId);
    }, [orders]);


    const value = {
        prototypeOrders: orders,
        prototypeStore: prototypeStore,
        prototypeProducts: products,
        loading: loading || !isClient,
        updatePrototypeOrder,
        addPrototypeOrder,
        addPrototypeProduct,
        updatePrototypeProduct,
        deletePrototypeProduct,
        updatePrototypeStore,
        getOrdersByStore,
        getOrdersByUser,
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
