import PageHeader from "@/components/page-header";
import { ReviewAnalyzer } from "./review-analyzer";
import { getDeliveryPersonnel } from "@/lib/data-service";
import type { DeliveryPersonnel } from "@/lib/placeholder-data";

export default async function DriverReviewsPage() {
  const allPersonnel: DeliveryPersonnel[] = await getDeliveryPersonnel();
  const activePersonnel = allPersonnel.filter(p => p.status === 'Activo' || p.status === 'Pendiente');

  return (
    <div className="container mx-auto">
      <PageHeader 
        title="Análisis de Reseñas de Conductores"
        description="Usa IA para analizar las reseñas de los clientes y etiquetar automáticamente el desempeño del conductor."
      />
      <ReviewAnalyzer personnel={activePersonnel} />
    </div>
  );
}
