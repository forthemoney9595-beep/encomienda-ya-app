'use server';

import PageHeader from '@/components/page-header';
import { getDeliveryPersonnel } from '@/lib/data-service';
import { DeliveryPersonnelList } from './delivery-personnel-list';

// Note: In a real app, you would protect this route with middleware.
// For this prototype, we assume the user is an admin if they can navigate here.

export default async function AdminDeliveryPage() {
  const personnel = await getDeliveryPersonnel();

  return (
    <div className="container mx-auto">
      <PageHeader title="Gestión de Repartidores" description="Administra las cuentas de tu personal de reparto." />
      <DeliveryPersonnelList initialPersonnel={personnel} />
    </div>
  );
}
