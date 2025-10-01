
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Order } from '@/lib/order-service';
import { initialPrototypeOrders, PROTOTYPE_ORDERS_KEY, initialPrototypeStores, prototypeDelivery as initialPrototypeDelivery } from '@/lib/placeholder-data';
import type { Store, Product, DeliveryPersonnel } from '@/lib/placeholder-data';

interface PrototypeDataContextType {
    prototypeOrders: Order[];
    prototypeStores: Store[];
    prototypeDelivery: DeliveryPersonnel;
    loading: boolean;
    updatePrototypeOrder: (orderId: string, updates: Partial<Order>) => void;
    addPrototypeOrder: (order: Order) => void;
    addPrototypeStore: (store: Store) => void;
    updatePrototypeProduct: (storeId: string, product: Product) => void;
    addPrototypeProduct: (storeId: string, product: Product) => void;
    deletePrototypeProduct: (storeId: string, productId: string) => void;
    updatePrototypeStore: (updates: Partial<Store>) => void;
    updatePrototypeDelivery: (updates: Partial<DeliveryPersonnel>) => void;
    getOrdersByStore: (storeId: string) => Order[];
    getOrdersByUser: (userId: string) => Order[];
    getAvailableOrdersForDelivery: () => Order[];
    getOrdersByDeliveryPerson: (driverId: string) => Order[];
    getOrderById: (orderId: string) => Order | undefined;
}

const PrototypeDataContext = createContext<PrototypeDataContextType | undefined>(undefined);

const PROTOTYPE_STORES_KEY = 'prototypeStores';
const PROTOTYPE_DELIVERY_KEY = 'prototypeDelivery';


export const PrototypeDataProvider = ({ children }: { children: ReactNode }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [stores, setStores] = useState<Store[]>(initialPrototypeStores);
    const [prototypeDelivery, setPrototypeDelivery] = useState<DeliveryPersonnel>(initialPrototypeDelivery);
    const [loading, setLoading] = useState(true);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // Load and manage data from session storage
    useEffect(() => {
        if (isClient) {
            try {
                const storedOrders = sessionStorage.getItem(PROTOTYPE_ORDERS_KEY);
                const loadedOrders = storedOrders 
                    ? JSON.parse(storedOrders, (key, value) => key === 'createdAt' ? new Date(value) : value)
                    : initialPrototypeOrders;
                 setOrders(loadedOrders);

                const storedStores = sessionStorage.getItem(PROTOTYPE_STORES_KEY);
                setStores(storedStores ? JSON.parse(storedStores) : initialPrototypeStores);
                
                const storedDelivery = sessionStorage.getItem(PROTOTYPE_DELIVERY_KEY);
                setPrototypeDelivery(storedDelivery ? JSON.parse(storedDelivery) : initialPrototypeDelivery);

            } catch (error) {
                console.error("Failed to load prototype data from session storage, resetting.", error);
                sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(initialPrototypeOrders));
                setOrders(initialPrototypeOrders);
                sessionStorage.setItem(PROTOTYPE_STORES_KEY, JSON.stringify(initialPrototypeStores));
                setStores(initialPrototypeStores);
                sessionStorage.setItem(PROTOTYPE_DELIVERY_KEY, JSON.stringify(initialPrototypeDelivery));
                setPrototypeDelivery(initialPrototypeDelivery);
            } finally {
                setLoading(false);
            }
        }
    }, [isClient]);

    const updateSessionStorage = (key: string, data: any) => {
        if (isClient) {
            sessionStorage.setItem(key, JSON.stringify(data));
        }
    };
    
    const updatePrototypeOrder = (orderId: string, updates: Partial<Order>) => {
        setOrders(prevOrders => {
            const updatedOrders = prevOrders.map(order => 
                order.id === orderId ? { ...order, ...updates } : order
            );
            updateSessionStorage(PROTOTYPE_ORDERS_KEY, updatedOrders);
            return updatedOrders;
        });
    };

    const addPrototypeOrder = (order: Order) => {
        setOrders(prevOrders => {
            const updatedOrders = [...prevOrders, order];
            updateSessionStorage(PROTOTYPE_ORDERS_KEY, updatedOrders);
            return updatedOrders;
        });
    };

    const addPrototypeStore = (store: Store) => {
        setStores(prevStores => {
            const updatedStores = [...prevStores, store];
            updateSessionStorage(PROTOTYPE_STORES_KEY, updatedStores);
            return updatedStores;
        });
    };

    const updatePrototypeStore = (updates: Partial<Store>) => {
       setStores(prevStores => {
            const updatedStores = prevStores.map(s => s.id === initialPrototypeStores[0].id ? { ...s, ...updates} : s)
            updateSessionStorage(PROTOTYPE_STORES_KEY, updatedStores);
            return updatedStores;
        });
    };

    const updatePrototypeDelivery = (updates: Partial<DeliveryPersonnel>) => {
        setPrototypeDelivery(prev => {
            const updatedDelivery = { ...prev, ...updates };
            updateSessionStorage(PROTOTYPE_DELIVERY_KEY, updatedDelivery);
            return updatedDelivery;
        });
    };

    const addPrototypeProduct = (storeId: string, product: Product) => {
        setStores(prev => {
            const newStores = prev.map(s => {
                if (s.id === storeId) {
                    const newProductCategories = [...s.productCategories];
                    if (!newProductCategories.map(c => c.toLowerCase()).includes(product.category.toLowerCase())) {
                        newProductCategories.push(product.category);
                    }
                    return { ...s, products: [...s.products, product], productCategories: newProductCategories };
                }
                return s;
            });
            updateSessionStorage(PROTOTYPE_STORES_KEY, newStores);
            return newStores;
        });
    }

    const updatePrototypeProduct = (storeId: string, productData: Product) => {
        setStores(prev => {
            const newStores = prev.map(s => {
                if (s.id === storeId) {
                    const updatedProducts = s.products.map(p => p.id === productData.id ? productData : p);
                     const newProductCategories = [...s.productCategories];
                    if (!newProductCategories.map(c => c.toLowerCase()).includes(productData.category.toLowerCase())) {
                        newProductCategories.push(productData.category);
                    }
                    return { ...s, products: updatedProducts, productCategories: newProductCategories };
                }
                return s;
            });
            updateSessionStorage(PROTOTYPE_STORES_KEY, newStores);
            return newStores;
        });
    }

    const deletePrototypeProduct = (storeId: string, productId: string) => {
        setStores(prev => {
            const newStores = prev.map(s => {
                if (s.id === storeId) {
                    const updatedProducts = s.products.filter(p => p.id !== productId);
                    return { ...s, products: updatedProducts };
                }
                return s;
            });
            updateSessionStorage(PROTOTYPE_STORES_KEY, newStores);
            return newStores;
        });
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
        prototypeStores: stores,
        prototypeDelivery,
        loading: loading || !isClient,
        updatePrototypeOrder,
        addPrototypeOrder,
        addPrototypeStore,
        addPrototypeProduct,
        updatePrototypeProduct,
        deletePrototypeProduct,
        updatePrototypeStore,
        updatePrototypeDelivery,
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
