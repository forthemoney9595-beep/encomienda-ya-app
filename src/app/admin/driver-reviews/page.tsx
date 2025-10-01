import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default async function DriverReviewsPage() {

  return (
    <div className="container mx-auto">
      <PageHeader 
        title="Análisis de Reseñas de Conductores"
        description="Esta funcionalidad fue eliminada debido a la complejidad con las dependencias de IA."
      />
      <Card>
        <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
                <p>La funcionalidad de análisis de reseñas con IA ha sido desactivada.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
