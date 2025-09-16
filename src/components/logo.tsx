import * as React from 'react';

const Logo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    width={32}
    height={32}
    {...props}
    className="text-sidebar-primary"
  >
    <g fill="currentColor">
      <path d="M50 5 a 10 10 0 0 1 0 20 a 10 10 0 0 1 0 -20 M40 30 L60 30 L55 95 L45 95 Z" />
    </g>
  </svg>
);

export default Logo;
