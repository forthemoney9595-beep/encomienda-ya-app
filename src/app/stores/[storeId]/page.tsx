import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getProductsByStoreId } from '@/lib/placeholder-data';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddItemDialog } from './add-item-dialog';
import { getStoreById } from '@/lib/data-service';
import { StoreOwnerTools } from './store-owner-tools';
import { ProductList } from './product-list';

export default async function StoreDetailPage({ params }: { params: { storeId: string } }) {
  const store = await getStoreById(params.storeId);
  
  if (!store) {
    notFound();
  }

  const products = getProductsByStoreId(params.storeId);
  const productCategories = Array.from(new Set(products.map(p => p.category)));

  return (
    <div className="container mx-auto">
      <PageHeader title={store.name} description={store.category}>
        <StoreOwnerTools storeId={store.id} />
      </PageHeader>
      
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Productos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProductList products={products} productCategories={productCategories} />
                </CardContent>
            </Card>
        </div>
        <div className="md:col-span-1">
             <Card>
                <CardHeader>
                    <CardTitle>Información de la Tienda</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="relative h-48 w-full">
                        <Image
                        src={store.imageUrl}
                        alt={store.name}
                        fill
                        style={{ objectFit: 'cover' }}
                        className="rounded-md"
                        data-ai-hint={store.imageHint}
                        />
                    </div>
                    <div>
                        <h3 className="font-semibold">Dirección</h3>
                        <p className="text-muted-foreground">{store.address}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold">Horario</h3>
                        <p className="text-muted-foreground">Lun-Dom: 11:00 AM - 10:00 PM</p>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
