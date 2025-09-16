import Link from 'next/link';
import Image from 'next/image';
import { stores } from '@/lib/placeholder-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import PageHeader from '@/components/page-header';

export default function Home() {
  return (
    <div className="container mx-auto">
      <PageHeader title="Welcome to EncomiendaYA!" description="Find your favorite stores and order online." />
      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input placeholder="Search stores..." className="pl-10 text-base" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stores.map((store) => (
          <Link href={`/stores/${store.id}`} key={store.id} className="group">
            <Card className="h-full overflow-hidden transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
              <div className="relative h-48 w-full">
                <Image
                  src={store.imageUrl}
                  alt={store.name}
                  fill
                  style={{ objectFit: 'cover' }}
                  className="transition-transform duration-300 group-hover:scale-105"
                  data-ai-hint={store.imageHint}
                />
              </div>
              <CardHeader>
                <CardTitle>{store.name}</CardTitle>
                <CardDescription>{store.category}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{store.address}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
