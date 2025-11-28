'use client';

import React, { createContext, useContext, useState } from 'react';

interface NotificationContextType {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// ✅ EXPORTACIÓN NOMBRADA PRINCIPAL (Tal como la usa layout.tsx)
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const incrementUnread = () => setUnreadCount((prev) => prev + 1);
  const clearNotifications = () => setUnreadCount(0);

  return (
    <NotificationContext.Provider value={{ unreadCount, setUnreadCount, incrementUnread, clearNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications debe usarse dentro de un NotificationProvider');
  }
  return context;
}