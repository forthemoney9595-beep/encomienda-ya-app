
'use client';

import { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlusCircle, Tag, Trash2, Edit, Loader2 } from 'lucide-react';
import { useAuth, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ManageCategoryDialog } from './manage-category-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc } from 'firebase/firestore';
import type { Store } from '@/lib/placeholder-data';

export default function StoreCategoriesPage() {
  const { user, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const storeRef = useMemoFirebase(() => {
    if (!firestore || !user?.storeId) return null;
    return doc(firestore, 'stores', user.storeId);
  }, [firestore, user?.storeId]);

  const { data: store, isLoading: storeLoading } = useDoc<Store>(storeRef);
  
  const [isManageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);

  const categories = useMemo(() => store?.productCategories || [], [store]);
  const isLoading = authLoading || storeLoading;

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'store' || !user.storeId)) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const handleSaveCategory = async (oldCategory: string | null, newCategory: string) => {
    if (!storeRef || !store) return;
    
    let updatedCategories: string[];
    let successMessage: string;

    if (oldCategory) { // Editing
      updatedCategories = categories.map(c => c === oldCategory ? newCategory : c);
      successMessage = 'Categoría actualizada con éxito.';
    } else { // Adding
      updatedCategories = [...categories, newCategory];
      successMessage = 'Categoría añadida con éxito.';
    }
    
    try {
        await updateDoc(storeRef, { productCategories: updatedCategories });
        toast({ title: successMessage });
        setManageDialogOpen(false);
    } catch (error) {
        console.error("Error saving category: ", error);
        toast({ title: 'Error al guardar', variant: 'destructive' });
    }
  };

  const handleDeleteCategory = async (categoryToDelete: string) => {
    if (!storeRef) return;

    const updatedCategories = categories.filter(c => c !== categoryToDelete);

    try {
        await updateDoc(storeRef, { productCategories: updatedCategories });
        toast({ title: 'Categoría eliminada', variant: 'destructive' });
    } catch(error) {
        console.error("Error deleting category: ", error);
        toast({ title: 'Error al eliminar', variant: 'destructive' });
    }
  };
  
  const openDialogForCreate = () => {
    setEditingCategory(null);
    setManageDialogOpen(true);
  };

  const openDialogForEdit = (category: string) => {
    setEditingCategory(category);
    setManageDialogOpen(true);
  };


  if (isLoading) {
    return (
      <div className="container mx-auto">
        <PageHeader title="Gestionar Categorías" description="Organiza los productos de tu tienda." />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <ManageCategoryDialog
        isOpen={isManageDialogOpen}
        setIsOpen={setManageDialogOpen}
        onSave={handleSaveCategory}
        category={editingCategory}
        existingCategories={categories}
      />
      <PageHeader title="Gestionar Categorías" description="Organiza los productos de tu tienda.">
        <Button onClick={openDialogForCreate}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Añadir Categoría
        </Button>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>Tus Categorías</CardTitle>
          <CardDescription>
            Estas son las categorías que los clientes verán en la página de tu tienda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {categories.length > 0 ? (
              categories.map(category => (
                <div key={category} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Tag className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openDialogForEdit(category)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Estás seguro de que quieres eliminar "{category}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. Los productos de esta categoría no serán eliminados, pero deberás asignarles una nueva categoría.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteCategory(category)}>Sí, eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-10">
                <p>No tienes categorías definidas.</p>
                <p className="text-sm">Haz clic en "Añadir Categoría" para crear la primera.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

    