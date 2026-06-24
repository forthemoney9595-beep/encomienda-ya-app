import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center gap-4 text-center px-4">
      <SearchX className="h-16 w-16 text-muted-foreground" />
      <h1 className="text-2xl font-bold">Esta página no existe</h1>
      <p className="text-muted-foreground max-w-sm">
        El link puede estar roto o la página puede haberse movido. Volvé al inicio para seguir navegando.
      </p>
      <Button asChild className="mt-2">
        <Link href="/">
          <Home className="mr-2 h-4 w-4" /> Ir al inicio
        </Link>
      </Button>
    </div>
  );
}
