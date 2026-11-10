import { Card } from '@/components/ui/card';
import { GlassBone } from '@/components/buyer-motion';

// Skeleton de carga en vidrio (rediseño 9/11/2026): misma forma que la StoreCard — fila en
// celular, tarjeta desde sm — para que al llegar los datos nada salte de lugar. El brillo
// que recorre se apaga con prefers-reduced-motion.
export function StoreCardSkeleton() {
  return (
    <Card aria-hidden="true" className="flex flex-row items-center gap-3 overflow-hidden p-3 sm:flex-col sm:items-stretch sm:p-0">
      <GlassBone className="h-[5.25rem] w-[5.25rem] shrink-0 rounded-2xl sm:aspect-[16/10] sm:h-auto sm:w-full sm:rounded-none" />
      <div className="min-w-0 flex-1 space-y-2.5 sm:p-4">
        <GlassBone className="h-6 w-3/4" />
        <GlassBone className="h-4 w-1/2" />
        <GlassBone className="h-4 w-2/3" />
      </div>
    </Card>
  );
}
