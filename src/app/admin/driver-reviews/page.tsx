import PageHeader from "@/components/page-header";
import { ReviewAnalyzer } from "./review-analyzer";

export default function DriverReviewsPage() {
  return (
    <div className="container mx-auto">
      <PageHeader 
        title="Análisis de Reseñas de Conductores"
        description="Usa IA para analizar las reseñas de los clientes y etiquetar automáticamente el desempeño del conductor."
      />
      <ReviewAnalyzer />
    </div>
  );
}
