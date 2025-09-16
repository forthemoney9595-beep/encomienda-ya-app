import PageHeader from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ShoppingBag } from 'lucide-react';

export default function OtherStoresPage() {
  return (
    <div className="container mx-auto">
      <PageHeader title="Otras Tiendas" description="Explora una variedad de otros productos." />
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
            <ShoppingBag className="h-16 w-16 mb-4" />
            <p className="text-lg">Aún no hay tiendas en esta categoría.</p>
            <p>Vuelve a consultar pronto.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
