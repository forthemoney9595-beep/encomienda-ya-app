'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Definimos la estructura del producto aquí para no depender de archivos externos
export interface CartItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  category?: string;
  imageUrl?: string;
  quantity: number;
  userRating?: number;
}

// Interfaz auxiliar para cuando añadimos un producto (sin cantidad)
export interface ProductInput {
  id: string;
  name: string;
  price: number;
  description?: string;
  category?: string;
  imageUrl?: string;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: ProductInput, storeId: string) => void;
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
  const [isClient, setIsClient] = useState(false);

  // Cargar desde LocalStorage al inicio
  useEffect(() => {
    setIsClient(true);
    try {
      const savedCart = localStorage.getItem('cart');
      const savedStoreId = localStorage.getItem('cartStoreId');
      
      if (savedCart) setCart(JSON.parse(savedCart));
      if (savedStoreId) setStoreId(JSON.parse(savedStoreId));
    } catch (error) {
      console.error("Error cargando carrito:", error);
      localStorage.removeItem('cart');
      localStorage.removeItem('cartStoreId');
    }
  }, []);

  // Guardar en LocalStorage al cambiar
  useEffect(() => {
    if (isClient) {
      localStorage.setItem('cart', JSON.stringify(cart));
      localStorage.setItem('cartStoreId', JSON.stringify(storeId));
    }
  }, [cart, storeId, isClient]);

  const addToCart = (product: ProductInput, newStoreId: string) => {
    // 🔍 LOG DE DEPURACIÓN: Verifica en la consola que este ID coincida con el de la tienda
    console.log(`🛒 Agregando al carrito. Tienda Actual: ${storeId}, Nueva Tienda: ${newStoreId}`);

    // Si el producto es de otra tienda, limpiar carrito (Regla de negocio: 1 tienda a la vez)
    if (storeId && storeId !== newStoreId) {
      if (confirm("Tu carrito tiene productos de otra tienda. ¿Quieres vaciarlo para añadir este?")) {
          setCart([{ ...product, quantity: 1 }]);
          setStoreId(newStoreId);
      }
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
        setStoreId(null); // Si se vacía, liberamos el ID de la tienda
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
    if (isClient) {
        localStorage.removeItem('cart');
        localStorage.removeItem('cartStoreId');
    }
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const value = {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    totalItems: isClient ? totalItems : 0,
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