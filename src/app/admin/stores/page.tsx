'use server';

import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { getStores } from '@/lib/data-service';
import { StoresList } from './stores-list';

// Nota: En una aplicación real, protegerías esta ruta con middleware.
// Para este prototipo, asumimos que el usuario es un administrador si puede navegar aquí.

export default async function AdminStoresPage() {
  const stores = await getStores(true); // Pasar true para obtener todas las tiendas (incluidas las pendientes)

  return (
    <div className="container mx-auto">
      <PageHeader title="Gestión de Tiendas" description="Agrega, edita o elimina cuentas de tiendas.">
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Agregar Nueva Tienda
        </Button>
      </PageHeader>
      <StoresList initialStores={stores} />
    </div>
  );
}
