'use client';

// This file is intentionally left blank. 
// It is a placeholder to resolve build errors during the migration from a prototype-only
// data system to a real Firebase backend. The components that once used this context
// are being refactored to use Firebase services directly. This file will be removed
// once the migration is complete.

import React, { createContext, useContext } from 'react';

const PrototypeDataContext = createContext<any>(null);

export const PrototypeDataProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <PrototypeDataContext.Provider value={{}}>
      {children}
    </PrototypeDataContext.Provider>
  );
};

export const usePrototypeData = () => {
  const context = useContext(PrototypeDataContext);
  if (context === undefined) {
    throw new Error('usePrototypeData must be used within a PrototypeDataProvider');
  }
  return { 
    prototypeStores: [],
    prototypeOrders: [],
    prototypeDelivery: null,
    loading: true,
    getStoreById: () => null,
    updatePrototypeStore: () => {},
    addPrototypeStore: () => {},
    deletePrototypeStore: () => {},
    updatePrototypeProduct: () => {},
    addPrototypeProduct: () => {},
    deletePrototypeProduct: () => {},
    prototypeNotifications: [],
    clearPrototypeNotifications: () => {},
    addPrototypeOrder: () => {},
    getOrdersByUser: () => [],
    getOrdersByStore: () => [],
    getAvailableOrdersForDelivery: () => [],
    getOrdersByDeliveryPerson: () => [],
    updatePrototypeOrder: () => {},
    addReviewToProduct: () => {},
    addDeliveryReviewToOrder: () => {},
    favoriteStores: [],
    toggleFavoriteStore: () => {},
    favoriteProducts: [],
    toggleFavoriteProduct: () => {},
    getReviewsByDriverId: () => [],
    updatePrototypeDelivery: () => {},
    addPrototypeDelivery: () => {},
    deletePrototypeDelivery: () => {},
  };
};
