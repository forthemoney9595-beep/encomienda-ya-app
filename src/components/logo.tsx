import * as React from 'react';
import { cn } from '@/lib/utils';

// El color por defecto es el de la marca en el menú; quien lo pone sobre otro fondo (el
// cuadradito de marca de las pantallas de ingreso) le pasa su propio className.
const Logo = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    width={32}
    height={32}
    aria-hidden="true"
    {...props}
    className={cn('text-sidebar-primary', className)}
  >
    <g fill="currentColor">
      <path d="M50 5 a 10 10 0 0 1 0 20 a 10 10 0 0 1 0 -20 M40 30 L60 30 L55 95 L45 95 Z" />
    </g>
  </svg>
);

export default Logo;
