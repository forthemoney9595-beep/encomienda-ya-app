
'use client';

import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useState } from 'react';
import { ManageItemDialog } from './manage-item-dialog';

interface StoreOwnerToolsProps {
  storeId: string;
  ownerId: string;
  productCategories: string[];
}

export function StoreOwnerTools({ storeId, ownerId }: StoreOwnerToolsProps) {
  const { user } = useAuth();
  const [isManageItemDialogOpen, setManageItemDialogOpen] = useState(false);

  const isStoreOwner = user?.uid === ownerId;

  if (!isStoreOwner) {
    return null;
  }
  
  const handleAddNewProduct = () => {
    setManageItemDialogOpen(true);
  };

  return (
    <>
      <Button onClick={handleAddNewProduct}>
        <PlusCircle className="mr-2 h-4 w-4" />
        Añadir Nuevo Artículo
      </Button>
      <ManageItemDialog
        isOpen={isManageItemDialogOpen}
        setIsOpen={setManageItemDialogOpen}
        storeId={storeId}
        product={null} // Pass null for creating a new product
      />
    </>
  );
}
