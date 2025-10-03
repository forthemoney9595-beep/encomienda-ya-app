

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Order } from '@/lib/order-service';
import { initialPrototypeStores, prototypeDelivery as initialPrototypeDelivery, initialPrototypeNotifications, initialPrototypeOrders, prototypeUsers as initialPrototypeUsers } from '@/lib/placeholder-data';
import type { Store, Product, DeliveryPersonnel, Notification, UserProfile, Address } from '@/lib/placeholder-data';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface PrototypeDataContextType {
    prototypeOrders: Order[];
    prototypeStores: Store[];
    prototypeDelivery: DeliveryPersonnel;
    prototypeNotifications: Notification[];
    prototypeUsers: Record<string, UserProfile>;
    loading: boolean;
    updateUser: (updates: Partial<UserProfile>) => void;
    updatePrototypeOrder: (orderId: string, updates: Partial<Order>) => void;
    addPrototypeOrder: (order: Order) => void;
    addPrototypeStore: (store: Store) => void;
    deletePrototypeStore: (storeId: string) => void;
    addPrototypeProduct: (storeId: string, product: Product) => void;
    updatePrototypeProduct: (storeId: string, product: Product) => void;
    deletePrototypeProduct: (storeId: string, productId: string) => void;
    addReviewToProduct: (storeId: string, productId: string, rating: number, reviewText: string) => void;
    addDeliveryReviewToOrder: (orderId: string, rating: number, review: string) => void;
    updatePrototypeStore: (updates: Partial<Store>) => void;
    updatePrototypeDelivery: (updates: Partial<DeliveryPersonnel>) => void;
    addPrototypeDelivery: (driver: DeliveryPersonnel) => void;
    deletePrototypeDelivery: (driverId: string) => void;
    clearPrototypeNotifications: () => void;
    getOrdersByStore: (storeId: string) => Order[];
    getOrdersByUser: (userId: string) => Order[];
    getAvailableOrdersForDelivery: () => Order[];
    getOrdersByDeliveryPerson: (driverId: string) => Order[];
    getOrderById: (orderId: string) => Order | undefined;
    getStoreById: (storeId: string) => Store | undefined;
    getReviewsByDriverId: (driverId: string) => Order[];
}

const PrototypeDataContext = createContext<PrototypeDataContextType | undefined>(undefined);

const PROTOTYPE_ORDERS_KEY = 'prototypeOrders';
const PROTOTYPE_STORES_KEY = 'prototypeStores';
const PROTOTYPE_DELIVERY_KEY = 'prototypeDelivery';
const PROTOTYPE_NOTIFICATIONS_KEY = 'prototypeNotifications';
const PROTOTYPE_USERS_KEY = 'prototypeUsers';


export const PrototypeDataProvider = ({ children }: { children: ReactNode }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [stores, setStores] = useState<Store[]>(initialPrototypeStores);
    const [prototypeDelivery, setPrototypeDelivery] = useState<DeliveryPersonnel>(initialPrototypeDelivery);
    const [notifications, setNotifications] = useState<Notification[]>(initialPrototypeNotifications);
    const [users, setUsers] = useState<Record<string, UserProfile>>(initialPrototypeUsers);
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
                    ? JSON.parse(storedOrders, (key, value) => (key === 'createdAt' || key === 'date') && value ? new Date(value) : value)
                    : initialPrototypeOrders;
                setOrders(loadedOrders);
                if (!storedOrders) {
                    sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(initialPrototypeOrders));
                }

                const storedStores = sessionStorage.getItem(PROTOTYPE_STORES_KEY);
                setStores(storedStores ? JSON.parse(storedStores) : initialPrototypeStores);
                
                const storedDelivery = sessionStorage.getItem(PROTOTYPE_DELIVERY_KEY);
                setPrototypeDelivery(storedDelivery ? JSON.parse(storedDelivery) : initialPrototypeDelivery);

                const storedNotifications = sessionStorage.getItem(PROTOTYPE_NOTIFICATIONS_KEY);
                setNotifications(storedNotifications ? JSON.parse(storedNotifications) : initialPrototypeNotifications);
                
                const storedUsers = sessionStorage.getItem(PROTOTYPE_USERS_KEY);
                setUsers(storedUsers ? JSON.parse(storedUsers) : initialPrototypeUsers);

            } catch (error) {
                console.error("Failed to load prototype data from session storage, resetting.", error);
                sessionStorage.setItem(PROTOTYPE_ORDERS_KEY, JSON.stringify(initialPrototypeOrders));
                setOrders(initialPrototypeOrders);
                sessionStorage.setItem(PROTOTYPE_STORES_KEY, JSON.stringify(initialPrototypeStores));
                setStores(initialPrototypeStores);
                sessionStorage.setItem(PROTOTYPE_DELIVERY_KEY, JSON.stringify(initialPrototypeDelivery));
                setPrototypeDelivery(initialPrototypeDelivery);
                sessionStorage.setItem(PROTOTYPE_NOTIFICATIONS_KEY, JSON.stringify(initialPrototypeNotifications));
                setNotifications(initialPrototypeNotifications);
                sessionStorage.setItem(PROTOTYPE_USERS_KEY, JSON.stringify(initialPrototypeUsers));
                setUsers(initialPrototypeUsers);
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

    const clearPrototypeNotifications = () => {
        setNotifications([]);
        updateSessionStorage(PROTOTYPE_NOTIFICATIONS_KEY, []);
    };
    
    const updateUser = (updates: Partial<UserProfile>) => {
        const currentUserEmail = sessionStorage.getItem('prototypeUserEmail');
        if (!currentUserEmail) return;

        setUsers(prevUsers => {
            const userToUpdate = prevUsers[currentUserEmail];
            if (!userToUpdate) return prevUsers;
            
            const updatedUser = { ...userToUpdate, ...updates };
            const updatedUsers = { ...prevUsers, [currentUserEmail]: updatedUser };
            
            updateSessionStorage(PROTOTYPE_USERS_KEY, updatedUsers);
            return updatedUsers;
        });
    };

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
            const existingIndex = prevStores.findIndex(s => s.id === store.id);
            let updatedStores;
            if (existingIndex > -1) {
                updatedStores = prevStores.map((s, i) => i === existingIndex ? store : s);
            } else {
                updatedStores = [...prevStores, store];
            }
            updateSessionStorage(PROTOTYPE_STORES_KEY, updatedStores);
            return updatedStores;
        });
    };

    const deletePrototypeStore = (storeId: string) => {
        setStores(prevStores => {
            const updatedStores = prevStores.filter(s => s.id !== storeId);
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

    const addPrototypeDelivery = (driver: DeliveryPersonnel) => {
      // In prototype, delivery drivers are not stored in a list, we just update the main one or add temporarily
      // This logic needs to be more robust if we want multi-driver prototype
      setPrototypeDelivery(driver);
      updateSessionStorage(PROTOTYPE_DELIVERY_KEY, driver);
    }
    
    const deletePrototypeDelivery = (driverId: string) => {
        // This is a placeholder as we only have one main prototype driver
        if (prototypeDelivery.id === driverId) {
            console.warn("Cannot delete the main prototype driver.");
        }
    }

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

    const addDeliveryReviewToOrder = (orderId: string, rating: number, review: string) => {
        setOrders(prevOrders => {
            const updatedOrders = prevOrders.map(order => 
                order.id === orderId 
                    ? { ...order, deliveryRating: rating, deliveryReview: review } 
                    : order
            );
            updateSessionStorage(PROTOTYPE_ORDERS_KEY, updatedOrders);
            return updatedOrders;
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
    
    const getStoreById = useCallback((storeId: string) => {
        return stores.find(s => s.id === storeId);
    }, [stores]);
    
    const getReviewsByDriverId = useCallback((driverId: string) => {
        return orders
            .filter(o => o.deliveryPersonId === driverId && o.status === 'Entregado' && o.deliveryRating !== undefined)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [orders]);


    const value = {
        prototypeOrders: orders,
        prototypeStores: stores,
        prototypeDelivery,
        prototypeNotifications: notifications,
        prototypeUsers: users,
        loading: loading || !isClient,
        updateUser,
        updatePrototypeOrder,
        addPrototypeOrder,
        addPrototypeStore,
        deletePrototypeStore,
        addPrototypeProduct,
        updatePrototypeProduct,
        deletePrototypeProduct,
        addReviewToProduct,
        addDeliveryReviewToOrder,
        updatePrototypeStore,
        updatePrototypeDelivery,
        addPrototypeDelivery,
        deletePrototypeDelivery,
        clearPrototypeNotifications,
        getOrdersByStore,
        getOrdersByUser,
        getAvailableOrdersForDelivery,
        getOrdersByDeliveryPerson,
        getOrderById,
        getStoreById,
        getReviewsByDriverId,
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
