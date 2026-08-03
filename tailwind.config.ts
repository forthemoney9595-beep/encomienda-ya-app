import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // OJO: `src/lib` tiene que estar acá. `lib/category-style.ts` define nombres de clase
    // (colores y gradientes por rubro) que no aparecen en ningún otro archivo; sin este
    // patrón, el JIT no los genera y salen SIN COLOR, en silencio y sin error de build.
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['"Inter"', 'sans-serif'],
        headline: ['"Lexend"', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        // Colores por rubro (ver --cat-* en globals.css). Separados de los semánticos
        // a propósito, para no pisar el significado de success/warning/destructive.
        cat: {
          brand: 'hsl(var(--cat-brand))',
          food: 'hsl(var(--cat-food))',
          fast: 'hsl(var(--cat-fast))',
          drink: 'hsl(var(--cat-drink))',
          kiosk: 'hsl(var(--cat-kiosk))',
          market: 'hsl(var(--cat-market))',
          pharma: 'hsl(var(--cat-pharma))',
          cloth: 'hsl(var(--cat-cloth))',
          home: 'hsl(var(--cat-home))',
          other: 'hsl(var(--cat-other))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--chart-5)))',
        sheen: 'linear-gradient(120deg, rgba(255,255,255,0.14), transparent 60%)',
      },
      boxShadow: {
        glow: '0 10px 30px -8px hsl(var(--primary) / 0.45)',
        'glow-sm': '0 4px 14px -4px hsl(var(--primary) / 0.5)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.34,1.56,.64,1)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        // Brillo que recorre un elemento — para skeletons "vivos" (ver .shimmer en globals.css).
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        // Flotación suave para los blobs decorativos del hero.
        float: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-14px) scale(1.04)' },
        },
        // Latido de resplandor para acentos (badges de oferta, punto de "abierto").
        'pulse-glow': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 hsl(var(--primary) / 0.45)' },
          '50%': { opacity: '0.92', boxShadow: '0 0 0 8px hsl(var(--primary) / 0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 1.8s infinite',
        float: 'float 7s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
