'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { CalendarDays, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { holidayKeys, normalizeSpecialHours, nowInArgentina } from '@/lib/store-hours';

// Tarjeta de fiestas (nov 2026): en diciembre le recuerda a la tienda que cargue el horario
// especial del 24 y el 31 ("así tus clientes saben hasta qué hora pedir"). Reglas:
// - solo del 1/12 al 31/12 en hora ARGENTINA (nowInArgentina(), también en el navegador:
//   un celular con otra zona horaria no la adelanta ni la atrasa);
// - solo si la tienda todavía NO cargó ni el 24 ni el 31 (con cualquiera de los dos ya
//   cargado se da por enterada);
// - se puede descartar POR DISPOSITIVO (localStorage, una clave por año: vuelve la próxima
//   Navidad). localStorage puede tirar (modo privado / WebView): todo con try/catch.
// No se muestra nada hasta montar en el cliente: así el HTML del server y el primer render
// coinciden (sin errores de hidratación) y el descarte no "parpadea".

const dismissKey = (year: number) => `eya-holiday-card-dismissed-${year}`;
const noSubscribe = () => () => {};
function readDismissed(year: number): boolean {
  try { return window.localStorage.getItem(dismissKey(year)) === '1'; } catch { return false; }
}

type StoreLike = { specialHours?: unknown } | null | undefined;

export function HolidayHoursCard({ store, className }: { store: StoreLike; className?: string }) {
  const [now] = useState(() => nowInArgentina());
  const year = now.getFullYear();
  // null en el server / primer render de hidratación; en el cliente, lo guardado.
  const stored = useSyncExternalStore<boolean | null>(noSubscribe, () => readDismissed(year), () => null);
  const [dismissedNow, setDismissed] = useState(false);

  if (stored === null || stored || dismissedNow || !store) return null;
  if (now.getMonth() !== 11) return null; // diciembre (0 = enero)

  const special = normalizeSpecialHours(store.specialHours) || {};
  const { christmasEve, newYearsEve } = holidayKeys(now);
  if (special[christmasEve] || special[newYearsEve]) return null;

  // Pasado el 24, la pregunta es solo por el 31.
  const question = now.getDate() <= 24 ? '¿Abrís el 24 y el 31?' : '¿Abrís el 31?';
  const nights = now.getDate() <= 24 ? 'esas noches' : 'esa noche';

  const dismiss = () => {
    setDismissed(true);
    try { window.localStorage.setItem(dismissKey(year), '1'); } catch { /* sin storage: se descarta solo por esta vez */ }
  };

  return (
    <Card data-testid="holiday-hours-card" className={cn('relative', className)}>
      <CardContent className="flex items-start gap-3 p-4 sm:p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><CalendarDays className="h-6 w-6" aria-hidden /></span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-headline text-2xl font-extrabold leading-tight">{question}</p>
          <p className="text-sm text-muted-foreground">
            Cargá un horario especial para {nights}, así tus clientes saben hasta qué hora pedir.
          </p>
          <Button asChild className="h-11 rounded-full px-5">
            <Link href="/my-store/edit#horario-especial">Cargar horario de fiestas</Link>
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-2 -mt-2 shrink-0 text-muted-foreground"
          onClick={dismiss}
          aria-label="Descartar aviso de fiestas"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
