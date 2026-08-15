'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface NotificationContextType {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// ✅ EXPORTACIÓN NOMBRADA PRINCIPAL (Tal como la usa layout.tsx)
//
// 🚨 Tanda A de la auditoría: `incrementUnread` se recreaba en CADA render del provider
// (y el value tampoco estaba memoizado). Como chat-listener lo tiene en las deps de su
// efecto, cada mensaje disparaba: incrementUnread → re-render → nueva identidad →
// re-suscripción de TODOS los listeners de chat → el snapshot inicial re-entregaba el
// último mensaje → volvía a sonar el ding → loop hasta vencer la ventana de 10 s.
// Con useCallback/useMemo la identidad es estable y el efecto no se re-dispara.
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const incrementUnread = useCallback(() => setUnreadCount((prev) => prev + 1), []);
  const clearNotifications = useCallback(() => setUnreadCount(0), []);

  const value = useMemo(
    () => ({ unreadCount, setUnreadCount, incrementUnread, clearNotifications }),
    [unreadCount, incrementUnread, clearNotifications],
  );

  return (
    <NotificationContext.Provider value={value}>
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
