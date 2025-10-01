import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default async function DriverReviewsPage() {

  return (
    <div className="container mx-auto">
      <PageHeader 
        title="Análisis de Reseñas de Conductores"
        description="Usa IA para analizar las reseñas de los clientes y etiquetar automáticamente el desempeño del conductor."
      />
      <Card>
        <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
                <p>La funcionalidad de análisis de reseñas con IA ha sido desactivada temporalmente.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
