'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useChristmas } from '@/hooks/use-christmas';
import { SantaHatGlyph } from '@/components/christmas-decor';

// El color por defecto es el de la marca en el menú; quien lo pone sobre otro fondo (el
// cuadradito de marca de las pantallas de ingreso) le pasa su propio className.
//
// Navidad (10/11/2026): en temporada (`useChristmas`) la figura lleva el gorro de Papá Noel
// inclinado sobre la cabeza. El gorro se dibuja ADENTRO del mismo <svg> con
// `overflow: visible`: sobresale unos px arriba pero la caja del ícono no cambia de tamaño.
// `festive={false}` lo apaga en un lugar puntual.
type LogoProps = React.SVGProps<SVGSVGElement> & { festive?: boolean };

const Logo = ({ className, festive, ...props }: LogoProps) => {
  const { active } = useChristmas();
  const withHat = festive ?? active;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={32}
      height={32}
      aria-hidden="true"
      data-logo-hat={withHat ? '' : undefined}
      {...props}
      className={cn('text-sidebar-primary', withHat && 'overflow-visible', className)}
    >
      <g fill="currentColor">
        <path d="M50 5 a 10 10 0 0 1 0 20 a 10 10 0 0 1 0 -20 M40 30 L60 30 L55 95 L45 95 Z" />
      </g>
      {withHat && <SantaHatGlyph />}
    </svg>
  );
};

export default Logo;
