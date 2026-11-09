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

  return (
    <div role="radiogroup" aria-label="Sonido de los avisos" className="space-y-2">
      {SOUND_OPTIONS.map((o) => {
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
              'flex min-h-12 w-full items-center gap-3 rounded-lg border-2 px-3 text-left transition-colors',
              active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
            )}
          >
            <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
            <span className="flex-1">
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
            {active && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
