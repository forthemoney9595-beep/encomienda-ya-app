'use client';

import type { Product } from '@/lib/placeholder-data';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CartItem extends Product {
    quantity: number;
}

interface CartContextType {
    cart: CartItem[];
    addToCart: (product: Product, storeId: string) => void;
    removeFromCart: (productId: string) => void;
    updateQuantity: (productId: string, quantity: number) => void;
    clearCart: () => void;
    totalItems: number;
    totalPrice: number;
    storeId: string | null;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [storeId, setStoreId] = useState<string | null>(null);

    // State to ensure we only run localStorage logic on the client
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (isClient) {
            try {
                const savedCart = localStorage.getItem('cart');
                const savedStoreId = localStorage.getItem('cartStoreId');
                if (savedCart) {
                    setCart(JSON.parse(savedCart));
                }
                if (savedStoreId) {
                    setStoreId(JSON.parse(savedStoreId));
                }
            } catch (error) {
                console.error("Failed to parse cart from localStorage", error);
                // Clear corrupted data
                localStorage.removeItem('cart');
                localStorage.removeItem('cartStoreId');
            }
        }
    }, [isClient]);

    useEffect(() => {
        if (isClient) {
            localStorage.setItem('cart', JSON.stringify(cart));
            localStorage.setItem('cartStoreId', JSON.stringify(storeId));
        }
    }, [cart, storeId, isClient]);

    const addToCart = (product: Product, newStoreId: string) => {
        // If the new item is from a different store, clear the cart first
        if (storeId && storeId !== newStoreId) {
            setCart([{ ...product, quantity: 1 }]);
            setStoreId(newStoreId);
            return;
        }

        if (!storeId) {
            setStoreId(newStoreId);
        }
        
        setCart(prevCart => {
            const existingItem = prevCart.find(item => item.id === product.id);
            if (existingItem) {
                return prevCart.map(item =>
                    item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            return [...prevCart, { ...product, quantity: 1 }];
        });
    };

    const removeFromCart = (productId: string) => {
        setCart(prevCart => {
            const updatedCart = prevCart.filter(item => item.id !== productId);
            if (updatedCart.length === 0) {
                setStoreId(null);
            }
            return updatedCart;
        });
    };

    const updateQuantity = (productId: string, quantity: number) => {
        if (quantity <= 0) {
            removeFromCart(productId);
            return;
        }
        setCart(prevCart =>
            prevCart.map(item =>
                item.id === productId ? { ...item, quantity } : item
            )
        );
    };

    const clearCart = () => {
        setCart([]);
        setStoreId(null);
    };

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const value = {
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems: isClient ? totalItems : 0, // Return 0 on server to prevent hydration mismatch
        totalPrice,
        storeId,
    };


    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
};
