'use client';

// Elegir el sonido de los avisos (9/11/2026). Vive en Perfil → Apariencia, junto al tema
// claro/oscuro, y se guarda en este dispositivo. Tocar una opción la elige y la hace sonar.
import { useEffect, useState } from 'react';
import { Check, Play, VolumeX } from 'lucide-react';
import { SOUND_OPTIONS, currentSound, playSound, saveSound, type SoundId } from '@/lib/notify-sounds';
import { cn } from '@/lib/utils';

export function SoundPicker() {
  const [selected, setSelected] = useState<SoundId | null>(null);

  // Se lee después de montar: localStorage no existe en el servidor.
  useEffect(() => { setSelected(currentSound()); }, []);

  const pick = (id: SoundId) => {
    setSelected(id);
    saveSound(id);
    playSound(id);
  };

  // Lista agrupada de vidrio (rediseño 9/11/2026): una tarjeta con filas de 56 px, el ícono en
  // un cuadradito y la marca de elegida que aparece con un pequeño salto. Tocar la elegida de
  // nuevo la vuelve a hacer sonar (sirve para probar el volumen).
  return (
    <div
      role="radiogroup"
      aria-label="Sonido de los avisos"
      className="overflow-hidden rounded-2xl border border-foreground/10 bg-background/40"
    >
      {SOUND_OPTIONS.map((o, i) => {
        const active = selected === o.id;
        const Icon = o.id === 'silencio' ? VolumeX : Play;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(o.id)}
            className={cn(
              'relative flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-200',
              'focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              i > 0 && 'border-t border-foreground/10',
              active ? 'bg-primary/10' : 'hover:bg-foreground/5',
            )}
          >
            {/* Barrita de la elegida: crece desde el centro */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary transition-transform duration-300 ease-spring motion-reduce:transition-none',
                active ? 'scale-y-100' : 'scale-y-0',
              )}
            />
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200',
                active ? 'bg-primary text-primary-foreground' : 'bg-foreground/5 text-muted-foreground',
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold leading-tight">{o.label}</span>
              <span className="block text-sm leading-snug text-muted-foreground">{o.hint}</span>
            </span>
            {active && (
              <Check className="h-5 w-5 shrink-0 text-primary animate-in zoom-in-50 fade-in-0 duration-200 motion-reduce:animate-none" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}
