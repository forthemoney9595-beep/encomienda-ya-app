'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  /** Sin href = es la página actual. */
  href?: string;
  icon?: LucideIcon;
}

interface BreadcrumbsProps {
  items: Crumb[];
  /** A dónde ir si no hay historial propio para volver. */
  backHref?: string;
  className?: string;
}

/**
 * Migas de pan + botón volver.
 *
 * A diferencia de `PageHeader`, el botón volver se ve en TODOS los tamaños: antes en
 * escritorio no había forma de retroceder desde la página de una tienda (y esa página ni
 * siquiera usaba PageHeader), así que para pasar de una tienda a otra había que volver al
 * inicio a mano.
 */
export function Breadcrumbs({ items, backHref = '/', className }: BreadcrumbsProps) {
  const router = useRouter();
  // OJO: window.history solo existe en el cliente. Si se evalúa durante el render, el
  // servidor devuelve un valor y el cliente otro -> error de hidratación. Por eso va acá.
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => setCanGoBack(window.history.length > 1), []);

  const goBack = () => (canGoBack ? router.back() : router.push(backHref));

  return (
    <div className={cn('mb-4 flex items-center gap-2', className)}>
      <Button
        variant="outline"
        size="icon"
        onClick={goBack}
        className="glass h-11 w-11 shrink-0 rounded-full border-[color:var(--glass-line)] bg-[color:var(--glass)] hover:bg-foreground/[0.06]"
        aria-label="Volver"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <nav aria-label="Migas de pan" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1 overflow-hidden text-sm">
          {items.map((item, i) => {
            const isLast = i === items.length - 1;
            const Icon = item.icon;
            return (
              <li key={`${item.label}-${i}`} className={cn('flex items-center gap-1', isLast || !item.href ? 'min-w-0' : 'shrink-0')}>
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                {isLast || !item.href ? (
                  <span aria-current="page" className="truncate font-medium text-foreground">
                    {Icon && <Icon className="mr-1 inline h-3.5 w-3.5" />}
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    title={item.label}
                    aria-label={Icon ? item.label : undefined}
                    className="flex min-h-[36px] min-w-[36px] items-center justify-center gap-1 rounded-full px-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                  >
                    {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                    {/* Vidrio (9/11/2026): antes en celular se cortaba con slice(0, 12) y
                        "Comida Rápida" quedaba "Comida Rápid". Ahora el nivel intermedio va
                        entero (con tope de ancho y puntos suspensivos solo si no entra) y el
                        que cede espacio es el nombre de la página actual. */}
                    {Icon
                      ? <span className="hidden sm:inline">{item.label}</span>
                      : <span className="max-w-[10rem] truncate sm:max-w-none">{item.label}</span>}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
