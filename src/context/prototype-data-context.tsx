

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
    favoriteStores: string[];
    favoriteProducts: string[];
    loading: boolean;
    updateUser: (updates: Partial<UserProfile>) => Promise<void>;
    updatePrototypeOrder: (orderId: string, updates: Partial<Order>) => Promise<void>;
    addPrototypeOrder: (order: Order) => Promise<void>;
    addPrototypeStore: (store: Store) => Promise<void>;
    deletePrototypeStore: (storeId: string) => Promise<void>;
    addPrototypeProduct: (storeId: string, product: Product) => Promise<void>;
    updatePrototypeProduct: (storeId: string, product: Product) => Promise<void>;
    deletePrototypeProduct: (storeId: string, productId: string) => Promise<void>;
    addReviewToProduct: (storeId: string, productId: string, rating: number, reviewText: string) => Promise<void>;
    addDeliveryReviewToOrder: (orderId: string, rating: number, review: string) => Promise<void>;
    updatePrototypeStore: (storeData: Store) => Promise<void>;
    updatePrototypeDelivery: (updates: Partial<DeliveryPersonnel>) => Promise<void>;
    addPrototypeDelivery: (driver: DeliveryPersonnel) => Promise<void>;
    deletePrototypeDelivery: (driverId: string) => Promise<void>;
    clearPrototypeNotifications: () => Promise<void>;
    getOrdersByStore: (storeId: string) => Order[];
    getOrdersByUser: (userId: string) => Order[];
    getAvailableOrdersForDelivery: () => Order[];
    getOrdersByDeliveryPerson: (driverId: string) => Order[];
    getOrderById: (orderId: string) => Order | undefined;
    getStoreById: (storeId: string) => Store | undefined;
    getReviewsByDriverId: (driverId: string) => Order[];
    toggleFavoriteStore: (storeId: string) => void;
    toggleFavoriteProduct: (productId: string) => void;
}

const PrototypeDataContext = createContext<PrototypeDataContextType | undefined>(undefined);

const PROTOTYPE_ORDERS_KEY = 'prototypeOrders';
const PROTOTYPE_STORES_KEY = 'prototypeStores';
const PROTOTYPE_DELIVERY_KEY = 'prototypeDelivery';
const PROTOTYPE_NOTIFICATIONS_KEY = 'prototypeNotifications';
const PROTOTYPE_USERS_KEY = 'prototypeUsers';
const FAVORITE_STORES_KEY = 'favoriteStores';
const FAVORITE_PRODUCTS_KEY = 'favoriteProducts';


export const PrototypeDataProvider = ({ children }: { children: ReactNode }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [stores, setStores] = useState<Store[]>(initialPrototypeStores);
    const [prototypeDelivery, setPrototypeDelivery] = useState<DeliveryPersonnel>(initialPrototypeDelivery);
    const [notifications, setNotifications] = useState<Notification[]>(initialPrototypeNotifications);
    const [users, setUsers] = useState<Record<string, UserProfile>>(initialPrototypeUsers);
    const [favoriteStores, setFavoriteStores] = useState<string[]>([]);
    const [favoriteProducts, setFavoriteProducts] = useState<string[]>([]);
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

                const storedFavoriteStores = sessionStorage.getItem(FAVORITE_STORES_KEY);
                setFavoriteStores(storedFavoriteStores ? JSON.parse(storedFavoriteStores) : []);

                const storedFavoriteProducts = sessionStorage.getItem(FAVORITE_PRODUCTS_KEY);
                setFavoriteProducts(storedFavoriteProducts ? JSON.parse(storedFavoriteProducts) : []);

            } catch (error) {
                console.error("Failed to load prototype data from session storage, resetting.", error);
                sessionStorage.clear(); // Clear all session storage on error
                setOrders(initialPrototypeOrders);
                setStores(initialPrototypeStores);
                setPrototypeDelivery(initialPrototypeDelivery);
                setNotifications(initialPrototypeNotifications);
                setUsers(initialPrototypeUsers);
                setFavoriteStores([]);
                setFavoriteProducts([]);
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
        return new Promise<void>((resolve) => {
            setNotifications(prev => {
                const newNotification: Notification = {
                    ...notification,
                    id: `notif-${Date.now()}`,
                    date: formatDistanceToNow(new Date(), { addSuffix: true, locale: es })
                };
                const updatedNotifications = [newNotification, ...prev];
                updateSessionStorage(PROTOTYPE_NOTIFICATIONS_KEY, updatedNotifications);
                resolve();
                return updatedNotifications;
            });
        });
    }

    const clearPrototypeNotifications = () => {
        return new Promise<void>((resolve) => {
            setNotifications([]);
            updateSessionStorage(PROTOTYPE_NOTIFICATIONS_KEY, []);
            resolve();
        });
    };
    
    const updateUser = (updates: Partial<UserProfile>) => {
       return new Promise<void>((resolve) => {
            const currentUserEmail = sessionStorage.getItem('prototypeUserEmail');
            if (!currentUserEmail) return resolve();

            setUsers(prevUsers => {
                const userToUpdate = prevUsers[currentUserEmail];
                if (!userToUpdate) return prevUsers;
                
                const updatedUser = { ...userToUpdate, ...updates };
                const updatedUsers = { ...prevUsers, [currentUserEmail]: updatedUser };
                
                updateSessionStorage(PROTOTYPE_USERS_KEY, updatedUsers);
                resolve();
                return updatedUsers;
            });
       });
    };

    const updatePrototypeOrder = (orderId: string, updates: Partial<Order>) => {
        return new Promise<void>(async (resolve) => {
            const originalOrder = orders.find(o => o.id === orderId);
            const updatedOrders = orders.map(order => 
                order.id === orderId ? { ...order, ...updates } : order
            );
            
            if (originalOrder && updates.status && originalOrder.status !== updates.status) {
                 await addNotification({
                    title: `Pedido Actualizado: #${orderId.substring(0,4)}`,
                    description: `Tu pedido de ${originalOrder.storeName} ahora está: ${updates.status}.`
                });
            }

            setOrders(updatedOrders);
            updateSessionStorage(PROTOTYPE_ORDERS_KEY, updatedOrders);
            resolve();
        });
    };

    const addPrototypeOrder = (order: Order) => {
        return new Promise<void>(async (resolve) => {
            const updatedOrders = [...orders, order];
            setOrders(updatedOrders);
            updateSessionStorage(PROTOTYPE_ORDERS_KEY, updatedOrders);
            await addNotification({
                title: "Pedido Solicitado",
                description: `Tu pedido a ${order.storeName} está pendiente de confirmación.`
            });
            resolve();
        });
    };

    const addPrototypeStore = (store: Store) => {
        return new Promise<void>((resolve) => {
            setStores(prevStores => {
                const existingIndex = prevStores.findIndex(s => s.id === store.id);
                let updatedStores;
                if (existingIndex > -1) {
                    updatedStores = prevStores.map((s, i) => i === existingIndex ? store : s);
                } else {
                    updatedStores = [...prevStores, store];
                }
                updateSessionStorage(PROTOTYPE_STORES_KEY, updatedStores);
                resolve();
                return updatedStores;
            });
        });
    };

    const deletePrototypeStore = (storeId: string) => {
        return new Promise<void>((resolve) => {
            setStores(prevStores => {
                const updatedStores = prevStores.filter(s => s.id !== storeId);
                updateSessionStorage(PROTOTYPE_STORES_KEY, updatedStores);
                resolve();
                return updatedStores;
            });
        });
    };

    const updatePrototypeStore = (storeData: Store) => {
       return new Promise<void>(async (resolve) => {
            const originalStore = stores.find(s => s.id === storeData.id);
            
            setStores(prevStores => {
                const updatedStores = prevStores.map(s => s.id === storeData.id ? storeData : s)
                updateSessionStorage(PROTOTYPE_STORES_KEY, updatedStores);

                if (originalStore && storeData.status && originalStore.status !== storeData.status && storeData.status === 'Aprobado') {
                    addNotification({
                        title: "¡Tu tienda ha sido aprobada!",
                        description: `¡Felicidades! La tienda "${originalStore.name}" ya está visible en la plataforma.`
                    });
                }
                
                return updatedStores;
            });
            
            resolve();
        });
    };

    const addPrototypeDelivery = (driver: DeliveryPersonnel) => {
      return new Promise<void>((resolve) => {
          setPrototypeDelivery(driver);
          updateSessionStorage(PROTOTYPE_DELIVERY_KEY, driver);
          resolve();
      });
    }
    
    const deletePrototypeDelivery = (driverId: string) => {
        return new Promise<void>((resolve) => {
            if (prototypeDelivery.id === driverId) {
                console.warn("Cannot delete the main prototype driver.");
            }
            resolve();
        });
    }

    const updatePrototypeDelivery = (updates: Partial<DeliveryPersonnel>) => {
        return new Promise<void>(async (resolve) => {
            const updatedDelivery = { ...prototypeDelivery, ...updates };
            if (prototypeDelivery.status !== updatedDelivery.status && updatedDelivery.status === 'Activo') {
                 await addNotification({
                    title: "¡Tu cuenta ha sido aprobada!",
                    description: "Ya puedes empezar a aceptar entregas. ¡Bienvenido al equipo!"
                });
            }
            setPrototypeDelivery(updatedDelivery);
            updateSessionStorage(PROTOTYPE_DELIVERY_KEY, updatedDelivery);
            resolve();
        });
    };

    const addPrototypeProduct = (storeId: string, product: Product) => {
        return new Promise<void>((resolve) => {
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
                resolve();
                return newStores;
            });
        });
    }

    const updatePrototypeProduct = (storeId: string, productData: Product) => {
        return new Promise<void>((resolve) => {
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
                resolve();
                return newStores;
            });
        });
    }

    const deletePrototypeProduct = (storeId: string, productId: string) => {
        return new Promise<void>((resolve) => {
            setStores(prev => {
                const newStores = prev.map(s => {
                    if (s.id === storeId) {
                        const updatedProducts = s.products.filter(p => p.id !== productId);
                        return { ...s, products: updatedProducts };
                    }
                    return s;
                });
                updateSessionStorage(PROTOTYPE_STORES_KEY, newStores);
                resolve();
                return newStores;
            });
        });
    }

    const addReviewToProduct = (storeId: string, productId: string, rating: number, reviewText: string) => {
        return new Promise<void>((resolve) => {
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
                resolve();
                return newStores;
            });
        });
    };

    const addDeliveryReviewToOrder = (orderId: string, rating: number, review: string) => {
        return new Promise<void>((resolve) => {
            setOrders(prevOrders => {
                const updatedOrders = prevOrders.map(order => 
                    order.id === orderId 
                        ? { ...order, deliveryRating: rating, deliveryReview: review } 
                        : order
                );
                updateSessionStorage(PROTOTYPE_ORDERS_KEY, updatedOrders);
                resolve();
                return updatedOrders;
            });
        });
    };

    const toggleFavoriteStore = (storeId: string) => {
        setFavoriteStores(prev => {
            const newFavorites = prev.includes(storeId)
                ? prev.filter(id => id !== storeId)
                : [...prev, storeId];
            updateSessionStorage(FAVORITE_STORES_KEY, newFavorites);
            return newFavorites;
        });
    };

    const toggleFavoriteProduct = (productId: string) => {
        setFavoriteProducts(prev => {
            const newFavorites = prev.includes(productId)
                ? prev.filter(id => id !== productId)
                : [...prev, productId];
            updateSessionStorage(FAVORITE_PRODUCTS_KEY, newFavorites);
            return newFavorites;
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
        favoriteStores,
        favoriteProducts,
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
        toggleFavoriteStore,
        toggleFavoriteProduct,
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
