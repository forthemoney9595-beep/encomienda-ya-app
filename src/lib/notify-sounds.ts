// Sonidos de aviso sintetizados con la Web Audio API (sin archivos que descargar).
// 9/11/2026: David pidió cambiar el pitido ("se lo siente muy feo") y eligió MARIMBA como
// predeterminado. Cada usuario puede elegir otro o silenciarlos en Perfil → Apariencia
// (sound-picker.tsx). La elección se guarda en ESTE dispositivo (localStorage), igual que
// el tema claro/oscuro. Nota: con la app cerrada, la notificación push suena con el tono
// del celular; esto controla los avisos con la app abierta (pedido nuevo, chat, estados).

export type SoundId = 'marimba' | 'campanita' | 'gota' | 'timbre' | 'silencio';

export const SOUND_OPTIONS: { id: SoundId; label: string; hint: string }[] = [
  { id: 'marimba', label: 'Marimba', hint: 'Tres notas de madera, cálidas' },
  { id: 'campanita', label: 'Campanita', hint: 'Dos golpes de campana' },
  { id: 'gota', label: 'Gota', hint: 'Dos gotas cortas, muy suave' },
  { id: 'timbre', label: 'Timbre de almacén', hint: 'Ding-dong de puerta de negocio' },
  { id: 'silencio', label: 'Silencio', hint: 'Sin sonido (los avisos se siguen viendo)' },
];

export const DEFAULT_SOUND: SoundId = 'marimba';
const STORAGE_KEY = 'eya-sound';

type Partial = { ratio: number; gain: number; decay: number };

function note(
  ctx: AudioContext,
  out: AudioNode,
  { freq, at, type = 'sine', partials = [{ ratio: 1, gain: 1, decay: 0.4 }], sweepTo }: {
    freq: number; at: number; type?: OscillatorType; partials?: Partial[]; sweepTo?: number;
  },
) {
  for (const p of partials) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * p.ratio, at);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo * p.ratio, at + p.decay * 0.6);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(p.gain, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + p.decay);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + p.decay + 0.05);
  }
}

const BELL: Partial[] = [
  { ratio: 1, gain: 1, decay: 1.3 },
  { ratio: 2.01, gain: 0.35, decay: 0.8 },
  { ratio: 3.02, gain: 0.15, decay: 0.45 },
  { ratio: 4.2, gain: 0.06, decay: 0.25 },
];
const MARIMBA: Partial[] = [
  { ratio: 1, gain: 1, decay: 0.55 },
  { ratio: 4, gain: 0.25, decay: 0.07 },
];
const CHIME: Partial[] = [
  { ratio: 1, gain: 1, decay: 1.0 },
  { ratio: 2, gain: 0.2, decay: 0.5 },
];

/** Dibuja el sonido y devuelve cuánto dura (para cerrar el contexto después). */
function render(ctx: AudioContext, out: AudioNode, id: SoundId): number {
  const t = ctx.currentTime + 0.02;
  switch (id) {
    case 'campanita':
      note(ctx, out, { freq: 783.99, at: t, partials: BELL });            // Sol5
      note(ctx, out, { freq: 1046.5, at: t + 0.16, partials: BELL });     // Do6
      return 1.6;
    case 'marimba':
      note(ctx, out, { freq: 523.25, at: t, partials: MARIMBA });         // Do5
      note(ctx, out, { freq: 659.25, at: t + 0.09, partials: MARIMBA });  // Mi5
      note(ctx, out, { freq: 783.99, at: t + 0.18, partials: MARIMBA });  // Sol5
      return 0.9;
    case 'gota':
      note(ctx, out, { freq: 1500, sweepTo: 750, at: t, partials: [{ ratio: 1, gain: 1, decay: 0.16 }] });
      note(ctx, out, { freq: 1900, sweepTo: 950, at: t + 0.15, partials: [{ ratio: 1, gain: 0.8, decay: 0.16 }] });
      return 0.5;
    case 'timbre':
      note(ctx, out, { freq: 659.25, at: t, type: 'triangle', partials: CHIME });         // Mi5
      note(ctx, out, { freq: 523.25, at: t + 0.38, type: 'triangle', partials: CHIME });  // Do5
      return 1.5;
    default:
      return 0;
  }
}

/** El sonido elegido en este dispositivo (o el predeterminado). */
export function currentSound(): SoundId {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as SoundId | null;
    if (v && SOUND_OPTIONS.some((o) => o.id === v)) return v;
  } catch { /* sin storage (modo privado, etc.) */ }
  return DEFAULT_SOUND;
}

export function saveSound(id: SoundId) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* sin storage */ }
}

/** Suena un aviso. No rompe si el navegador no tiene audio o bloquea el autoplay. */
export function playSound(id: SoundId = currentSound()) {
  if (id === 'silencio') return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    const dur = render(ctx, master, id);
    setTimeout(() => ctx.close().catch(() => {}), (dur + 0.3) * 1000);
  } catch {
    // silencioso
  }
}
