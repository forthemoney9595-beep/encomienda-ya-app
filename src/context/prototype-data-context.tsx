
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Order } from '@/lib/order-service';
import { initialPrototypeStores, prototypeDelivery as initialPrototypeDelivery, initialPrototypeNotifications } from '@/lib/placeholder-data';
import type { Store, Product, DeliveryPersonnel, Notification } from '@/lib/placeholder-data';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface PrototypeDataContextType {
    prototypeOrders: Order[];
    prototypeStores: Store[];
    prototypeDelivery: DeliveryPersonnel;
    prototypeNotifications: Notification[];
    loading: boolean;
    updatePrototypeOrder: (orderId: string, updates: Partial<Order>) => void;
    addPrototypeOrder: (order: Order) => void;
    addPrototypeStore: (store: Store) => void;
    updatePrototypeProduct: (storeId: string, product: Product) => void;
    addPrototypeProduct: (storeId: string, product: Product) => void;
    deletePrototypeProduct: (storeId: string, productId: string) => void;
    addReviewToProduct: (storeId: string, productId: string, rating: number, reviewText: string) => void;
    updatePrototypeStore: (updates: Partial<Store>) => void;
    updatePrototypeDelivery: (updates: Partial<DeliveryPersonnel>) => void;
    getOrdersByStore: (storeId: string) => Order[];
    getOrdersByUser: (userId: string) => Order[];
    getAvailableOrdersForDelivery: () => Order[];
    getOrdersByDeliveryPerson: (driverId: string) => Order[];
    getOrderById: (orderId: string) => Order | undefined;
}

const PrototypeDataContext = createContext<PrototypeDataContextType | undefined>(undefined);

const PROTOTYPE_ORDERS_KEY = 'prototypeOrders';
const PROTOTYPE_STORES_KEY = 'prototypeStores';
const PROTOTYPE_DELIVERY_KEY = 'prototypeDelivery';
const PROTOTYPE_NOTIFICATIONS_KEY = 'prototypeNotifications';


export const PrototypeDataProvider = ({ children }: { children: ReactNode }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [stores, setStores] = useState<Store[]>(initialPrototypeStores);
    const [prototypeDelivery, setPrototypeDelivery] = useState<DeliveryPersonnel>(initialPrototypeDelivery);
    const [notifications, setNotifications] = useState<Notification[]>(initialPrototypeNotifications);
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
                    : [];
                 setOrders(loadedOrders);

                const storedStores = sessionStorage.getItem(PROTOTYPE_STORES_KEY);
                setStores(storedStores ? JSON.parse(storedStores) : initialPrototypeStores);
                
                const storedDelivery = sessionStorage.getItem(PROTOTYPE_DELIVERY_KEY);
                setPrototypeDelivery(storedDelivery ? JSON.parse(storedDelivery) : initialPrototypeDelivery);

                const storedNotifications = sessionStorage.getItem(PROTOTYPE_NOTIFICATIONS_KEY);
                setNotifications(storedNotifications ? JSON.parse(storedNotifications) : initialPrototypeNotifications);

            } catch (error) {
                console.error("Failed to load prototype data from session storage, resetting.", error);
                sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify([]));
                setOrders([]);
                sessionStorage.setItem(PROTOTYPE_STORES_KEY, JSON.stringify(initialPrototypeStores));
                setStores(initialPrototypeStores);
                sessionStorage.setItem(PROTOTYPE_DELIVERY_KEY, JSON.stringify(initialPrototypeDelivery));
                setPrototypeDelivery(initialPrototypeDelivery);
                sessionStorage.setItem(PROTOTYPE_NOTIFICATIONS_KEY, JSON.stringify(initialPrototypeNotifications));
                setNotifications(initialPrototypeNotifications);
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
    
    const addNotification = (notification: Omit<Notification, 'id' | 'date'>) => {
        setNotifications(prev => {
            const newNotification: Notification = {
                ...notification,
                id: `notif-${Date.now()}`,
                date: formatDistanceToNow(new Date(), { addSuffix: true, locale: es })
            };
            const updatedNotifications = [newNotification, ...prev];
            updateSessionStorage(PROTOTYPE_NOTIFICATIONS_KEY, updatedNotifications);
            return updatedNotifications;
        });
    }

    const updatePrototypeOrder = (orderId: string, updates: Partial<Order>) => {
        setOrders(prevOrders => {
            const originalOrder = prevOrders.find(o => o.id === orderId);
            const updatedOrders = prevOrders.map(order => 
                order.id === orderId ? { ...order, ...updates } : order
            );
            
            if (originalOrder && updates.status && originalOrder.status !== updates.status) {
                 addNotification({
                    title: `Pedido Actualizado: #${orderId.substring(0,4)}`,
                    description: `Tu pedido de ${originalOrder.storeName} ahora está: ${updates.status}.`
                });
            }

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
         addNotification({
            title: "Pedido Solicitado",
            description: `Tu pedido a ${order.storeName} está pendiente de confirmación.`
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
            const originalStore = prevStores.find(s => s.id === updates.id);
            const updatedStores = prevStores.map(s => s.id === updates.id ? { ...s, ...updates} : s)
            
            if (originalStore && updates.status && originalStore.status !== updates.status && updates.status === 'Aprobado') {
                addNotification({
                    title: "¡Tu tienda ha sido aprobada!",
                    description: `¡Felicidades! La tienda "${originalStore.name}" ya está visible en la plataforma.`
                });
            }

            updateSessionStorage(PROTOTYPE_STORES_KEY, updatedStores);
            return updatedStores;
        });
    };

    const updatePrototypeDelivery = (updates: Partial<DeliveryPersonnel>) => {
        setPrototypeDelivery(prev => {
            const updatedDelivery = { ...prev, ...updates };
            if (prev.status !== updatedDelivery.status && updatedDelivery.status === 'Activo') {
                 addNotification({
                    title: "¡Tu cuenta ha sido aprobada!",
                    description: "Ya puedes empezar a aceptar entregas. ¡Bienvenido al equipo!"
                });
            }
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

    const addReviewToProduct = (storeId: string, productId: string, rating: number, reviewText: string) => {
        setStores(prevStores => {
            const newStores = prevStores.map(store => {
                if (store.id === storeId) {
                    const newProducts = store.products.map(product => {
                        if (product.id === productId) {
                            const newReviewCount = product.reviewCount + 1;
                            const newTotalRating = (product.rating * product.reviewCount) + rating;
                            const newAverageRating = newTotalRating / newReviewCount;
                            return {
                                ...product,
                                rating: newAverageRating,
                                reviewCount: newReviewCount,
                            };
                        }
                        return product;
                    });
                    return { ...store, products: newProducts };
                }
                return store;
            });
            updateSessionStorage(PROTOTYPE_STORES_KEY, newStores);
            return newStores;
        });
    };
    
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
        prototypeNotifications: notifications,
        loading: loading || !isClient,
        updatePrototypeOrder,
        addPrototypeOrder,
        addPrototypeStore,
        addPrototypeProduct,
        updatePrototypeProduct,
        deletePrototypeProduct,
        addReviewToProduct,
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
