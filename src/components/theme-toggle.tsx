'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Interruptor de tema (Rediseño D4, 19/8) — pensado sobre todo para los usuarios
 * mayores, que suelen leer mejor con fondo claro. Vive en Perfil.
 *
 * El tema por defecto es CLARO (desde el Rediseño 2: se lee mejor al sol); la elección se
 * guarda en localStorage ('eya-theme') y un script en el <head> de layout.tsx la aplica
 * antes del primer paint (sin parpadeo). Acá solo se alterna la clase y el meta theme-color.
 */
export function ThemeToggle() {
  // Se lee recién al montar (localStorage no existe en el server).
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null);

  useEffect(() => {
    try {
      setTheme(localStorage.getItem('eya-theme') === 'dark' ? 'dark' : 'light');
    } catch {
      setTheme('light');
    }
  }, []);

  const apply = (next: 'dark' | 'light') => {
    setTheme(next);
    try { localStorage.setItem('eya-theme', next); } catch {}
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', next === 'dark' ? '#121618' : '#EEF1F1',
    );
  };

  const OPTIONS = [
    { key: 'light' as const, label: 'Claro', Icon: Sun },
    { key: 'dark' as const, label: 'Oscuro', Icon: Moon },
  ];
  const index = theme === 'dark' ? 1 : 0;

  // Segmentado de vidrio con una píldora que se DESLIZA hasta la opción elegida (rediseño en
  // vidrio, 9/11/2026). Antes de montar (theme null) la píldora no se muestra, para no marcar
  // una opción que quizás no es la guardada.
  return (
    <div
      className="relative inline-grid min-h-12 grid-cols-2 rounded-2xl border border-foreground/10 bg-background/50 p-1"
      role="radiogroup"
      aria-label="Tema de la app"
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-primary shadow-sm transition-transform duration-300 ease-spring motion-reduce:transition-none',
          theme === null && 'opacity-0',
        )}
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={theme === key}
          onClick={() => apply(key)}
          className={cn(
            'relative z-[1] flex min-h-10 min-w-[7.5rem] items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors duration-300',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            theme === key ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
