import PageHeader from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Shirt } from 'lucide-react';

export default function ClothingStoresPage() {
  return (
    <div className="container mx-auto">
      <PageHeader title="Tiendas de Ropa" description="Encuentra las mejores marcas y estilos." />
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
            <Shirt className="h-16 w-16 mb-4" />
            <p className="text-lg">Aún no hay tiendas de ropa disponibles.</p>
            <p>Vuelve a consultar pronto.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
