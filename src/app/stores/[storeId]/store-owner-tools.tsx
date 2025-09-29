'use client';

import { useAuth } from '@/context/auth-context';
import { AddItemDialog } from './add-item-dialog';

interface StoreOwnerToolsProps {
  storeId: string;
  ownerId: string;
  productCategories: string[];
}

export function StoreOwnerTools({ storeId, ownerId, productCategories }: StoreOwnerToolsProps) {
  const { user } = useAuth();
  
  const isStoreOwner = user?.uid === ownerId;

  if (!isStoreOwner) {
    return null;
  }

  return <AddItemDialog storeId={storeId} productCategories={productCategories} />;
}
