'use client';

// SOLO SERVIDOR LOCAL (9/11): panel para que David elija el color de marca y el sonido de
// aviso mirando la app real. Se monta únicamente con NODE_ENV=development (layout.tsx) y se
// BORRA cuando elija: el color queda en globals.css y el sonido como DEFAULT_SOUND.

import { useEffect, useState } from 'react';
import { Palette, Play, X, Check } from 'lucide-react';
import { SOUND_OPTIONS, currentSound, playSound, setDevSound, type SoundId } from '@/lib/notify-sounds';

type Brand = { id: string; label: string; light: string; dark: string };

// [tono saturación luz] — claro con texto blanco encima; pizarra con texto oscuro encima.
const BRANDS: Brand[] = [
  { id: 'fucsia', label: 'Fucsia (el de ahora)', light: '332 80% 38%', dark: '332 100% 78%' },
  { id: 'violeta', label: 'Violeta', light: '263 70% 50%', dark: '255 90% 80%' },
  { id: 'indigo', label: 'Índigo', light: '243 62% 50%', dark: '234 89% 80%' },
  { id: 'marino', label: 'Azul marino', light: '224 70% 38%', dark: '214 90% 76%' },
  { id: 'bordo', label: 'Bordó', light: '352 62% 33%', dark: '2 75% 76%' },
  { id: 'petroleo', label: 'Petróleo', light: '191 78% 26%', dark: '186 55% 62%' },
];
const BRAND_KEY = 'eya-dev-brand';

function hueOf(hsl: string) { return hsl.split(' ')[0]; }

function cssFor(b: Brand) {
  const hl = hueOf(b.light);
  const hd = hueOf(b.dark);
  return `
html:not(.dark){--primary:${b.light};--ring:${b.light};--cat-brand:${b.light};--sidebar-ring:${b.light};
  --sidebar-accent:${hl} 60% 94%;--sidebar-accent-foreground:${hl} 70% 28%;}
html.dark{--primary:${b.dark};--ring:${b.dark};--cat-brand:${b.dark};--sidebar-ring:${b.dark};
  --sidebar-accent:${hd} 30% 20%;--sidebar-accent-foreground:${b.dark};}
html:not(.dark) .awn-brand{--c:hsl(${b.light});}
html.dark .awn-brand{--c:hsl(${b.light});}`;
}

function applyBrand(id: string) {
  const b = BRANDS.find((x) => x.id === id) ?? BRANDS[0];
  let el = document.getElementById('dev-brand') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'dev-brand';
    document.head.appendChild(el);
  }
  el.textContent = b.id === 'fucsia' ? '' : cssFor(b);
}

export function DevPreviewPanel() {
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState('fucsia');
  const [sound, setSound] = useState<SoundId>('beep');

  useEffect(() => {
    let saved = 'fucsia';
    try { saved = localStorage.getItem(BRAND_KEY) || 'fucsia'; } catch { /* sin storage */ }
    setBrand(saved);
    applyBrand(saved);
    setSound(currentSound());
  }, []);

  const pickBrand = (id: string) => {
    setBrand(id);
    applyBrand(id);
    try { localStorage.setItem(BRAND_KEY, id); } catch { /* sin storage */ }
  };

  const pickSound = (id: SoundId) => {
    setSound(id);
    setDevSound(id);
    playSound(id);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 left-3 z-[60] flex min-h-12 items-center gap-2 rounded-full border-2 border-foreground bg-background px-4 text-sm font-semibold shadow-lg md:bottom-4"
      >
        <Palette className="h-5 w-5" aria-hidden /> Probar color y sonido
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 left-3 right-3 z-[60] max-h-[70vh] overflow-y-auto rounded-xl border-2 border-foreground bg-background p-4 shadow-2xl sm:right-auto sm:w-[360px] md:bottom-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-headline text-xl font-bold uppercase leading-none">Vista previa</p>
          <p className="mt-1 text-xs text-muted-foreground">Solo en tu servidor local. No se sube a la app.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar vista previa" className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted">
          <X className="h-5 w-5" />
        </button>
      </div>

      <p className="mb-2 text-sm font-semibold">Color de la marca</p>
      <div className="grid grid-cols-2 gap-2">
        {BRANDS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => pickBrand(b.id)}
            aria-pressed={brand === b.id}
            className={`flex min-h-12 items-center gap-2 rounded-lg border-2 px-2 text-left text-sm ${brand === b.id ? 'border-foreground' : 'border-border'}`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: `hsl(${b.light})` }}>
              {brand === b.id && <Check className="h-4 w-4 text-white" />}
            </span>
            <span className="h-4 w-4 shrink-0 rounded-full border border-border" style={{ background: `hsl(${b.dark})` }} aria-hidden />
            <span className="leading-tight">{b.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">El círculo grande es el modo claro; el chico, el oscuro.</p>

      <p className="mb-2 mt-4 text-sm font-semibold">Sonido de aviso (tocá para escucharlo)</p>
      <div className="space-y-2">
        {SOUND_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => pickSound(o.id)}
            aria-pressed={sound === o.id}
            className={`flex min-h-12 w-full items-center gap-3 rounded-lg border-2 px-3 text-left ${sound === o.id ? 'border-foreground' : 'border-border'}`}
          >
            <Play className="h-5 w-5 shrink-0" aria-hidden />
            <span className="flex-1">
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
            {sound === o.id && <Check className="h-5 w-5 shrink-0" aria-label="Elegido" />}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">El elegido también suena en la app (pedido nuevo, chat, avisos) mientras pruebes acá.</p>
    </div>
  );
}
