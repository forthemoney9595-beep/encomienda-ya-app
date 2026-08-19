'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Interruptor de tema (Rediseño D4, 19/8) — pensado sobre todo para los usuarios
 * mayores, que suelen leer mejor con fondo claro. Vive en Perfil.
 *
 * El tema por defecto es OSCURO (la identidad de siempre); la elección se guarda en
 * localStorage ('eya-theme') y un script en el <head> de layout.tsx la aplica antes
 * del primer paint (sin parpadeo). Acá solo se alterna la clase y el meta theme-color.
 */
export function ThemeToggle() {
  // Se lee recién al montar (localStorage no existe en el server).
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null);

  useEffect(() => {
    try {
      setTheme(localStorage.getItem('eya-theme') === 'light' ? 'light' : 'dark');
    } catch {
      setTheme('dark');
    }
  }, []);

  const apply = (next: 'dark' | 'light') => {
    setTheme(next);
    try { localStorage.setItem('eya-theme', next); } catch {}
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', next === 'dark' ? '#8B5CF6' : '#F6F5FA',
    );
  };

  return (
    <div className="inline-flex rounded-full border border-border bg-muted p-1" role="radiogroup" aria-label="Tema de la app">
      {([
        { key: 'dark' as const, label: 'Oscuro', Icon: Moon },
        { key: 'light' as const, label: 'Claro', Icon: Sun },
      ]).map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={theme === key}
          onClick={() => apply(key)}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
            theme === key
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
