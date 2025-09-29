'use client';

import { useAuth } from '@/context/auth-context';
import { AddItemDialog } from './add-item-dialog';

export function StoreOwnerTools({ storeId }: { storeId: string }) {
  const { user } = useAuth();
  
  // Asumiendo que el perfil de usuario tiene un campo 'storeId' si su rol es 'store'
  const isStoreOwner = user?.role === 'store' && user?.storeId === storeId;

  if (!isStoreOwner) {
    return null;
  }

  return <AddItemDialog />;
}
