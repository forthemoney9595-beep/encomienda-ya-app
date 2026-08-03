import {
  LayoutGrid, Utensils, Sandwich, Shirt, Coffee, Laptop, Pill, ShoppingCart, Store, type LucideIcon,
} from 'lucide-react';

// Ícono + color por RUBRO. Lo usan los chips de categoría del inicio, los del menú de una
// tienda y el sidebar, para que los tres hablen el mismo idioma visual.
//
// OJO Tailwind: todos los nombres de clase de acá tienen que ser literales. Construirlos
// concatenando (`from-cat-${key}`) NO funciona: el JIT escanea texto, no evalúa. Además
// `src/lib` tuvo que agregarse al `content` de tailwind.config.ts para que estas clases
// (que no aparecen en ningún otro archivo) lleguen a generarse.

export type CategoryStyle = {
  icon: LucideIcon;
  bg: string;       // panel suave (chip inactivo)
  text: string;     // color del ícono/etiqueta
  ring: string;     // anillo del chip activo
  solid: string;    // badge lleno — incluye el color de texto correcto para ese fondo
  gradient: string; // degradé para el placeholder de imagen (ver components/store-image.tsx)
};

export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  brand: {
    icon: LayoutGrid,
    bg: 'bg-cat-brand/15', text: 'text-cat-brand', ring: 'ring-cat-brand/40',
    solid: 'bg-cat-brand text-white',
    gradient: 'from-cat-brand via-cat-brand/70 to-cat-other/60',
  },
  food: {
    icon: Utensils,
    bg: 'bg-cat-food/15', text: 'text-cat-food', ring: 'ring-cat-food/40',
    solid: 'bg-cat-food text-black',
    gradient: 'from-cat-food via-cat-food/70 to-cat-fast/60',
  },
  fast: {
    icon: Sandwich,
    bg: 'bg-cat-fast/15', text: 'text-cat-fast', ring: 'ring-cat-fast/40',
    solid: 'bg-cat-fast text-white',
    gradient: 'from-cat-fast via-cat-fast/70 to-cat-food/60',
  },
  drink: {
    icon: Coffee,
    bg: 'bg-cat-drink/15', text: 'text-cat-drink', ring: 'ring-cat-drink/40',
    solid: 'bg-cat-drink text-black',
    gradient: 'from-cat-drink via-cat-drink/70 to-cat-cloth/60',
  },
  kiosk: {
    icon: Store,
    bg: 'bg-cat-kiosk/15', text: 'text-cat-kiosk', ring: 'ring-cat-kiosk/40',
    solid: 'bg-cat-kiosk text-white',
    gradient: 'from-cat-kiosk via-cat-kiosk/70 to-cat-brand/60',
  },
  market: {
    icon: ShoppingCart,
    bg: 'bg-cat-market/15', text: 'text-cat-market', ring: 'ring-cat-market/40',
    solid: 'bg-cat-market text-black',
    gradient: 'from-cat-market via-cat-market/70 to-cat-pharma/60',
  },
  pharma: {
    icon: Pill,
    bg: 'bg-cat-pharma/15', text: 'text-cat-pharma', ring: 'ring-cat-pharma/40',
    solid: 'bg-cat-pharma text-white',
    gradient: 'from-cat-pharma via-cat-pharma/70 to-cat-drink/60',
  },
  cloth: {
    icon: Shirt,
    bg: 'bg-cat-cloth/15', text: 'text-cat-cloth', ring: 'ring-cat-cloth/40',
    solid: 'bg-cat-cloth text-white',
    gradient: 'from-cat-cloth via-cat-cloth/70 to-cat-brand/60',
  },
  home: {
    icon: Laptop,
    bg: 'bg-cat-home/15', text: 'text-cat-home', ring: 'ring-cat-home/40',
    solid: 'bg-cat-home text-black',
    gradient: 'from-cat-home via-cat-home/70 to-cat-food/60',
  },
  other: {
    icon: Store,
    bg: 'bg-cat-other/15', text: 'text-cat-other', ring: 'ring-cat-other/40',
    solid: 'bg-cat-other text-white',
    gradient: 'from-cat-other via-cat-other/70 to-cat-kiosk/60',
  },
};

// Rubros a los que puede caer un nombre desconocido (excluye 'brand', que es solo "Todas").
const FALLBACK_KEYS = ['food', 'fast', 'drink', 'kiosk', 'market', 'pharma', 'cloth', 'home', 'other'];

// Hash estable de un string. Se usa para que un rubro desconocido tenga SIEMPRE el mismo
// color: antes se elegía por posición en el array, así que el color de una categoría
// cambiaba si aparecía otra tienda antes en la lista.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function getCategoryKey(category: string): string {
  const c = (category || '').toLowerCase().trim();
  if (!c) return 'other';
  if (c === 'todas' || c === 'todos') return 'brand';

  // El ORDEN importa y es la corrección del bug de colores repetidos:
  // "comida-rapida".includes('comida') es true, así que lo rápido va ANTES que comida.
  if (c.includes('rapid') || c.includes('rápid') || c.includes('fast') || c.includes('burger') || c.includes('hamburg')) return 'fast';
  if (c.includes('farmac') || c.includes('pharma')) return 'pharma';
  // Ídem: kiosco/almacén va ANTES que supermercado, antes compartían color.
  if (c.includes('kiosco') || c.includes('kiosk') || c.includes('almac') || c.includes('despensa')) return 'kiosk';
  if (c.includes('super') || c.includes('mercado') || c.includes('market')) return 'market';
  if (c.includes('bebida') || c.includes('drink') || c.includes('vino') || c.includes('cerveza') || c.includes('café') || c.includes('cafe')) return 'drink';
  if (c.includes('comida') || c.includes('food') || c.includes('pizza') || c.includes('empanada') || c.includes('resto') || c.includes('parrilla')) return 'food';
  if (c.includes('ropa') || c.includes('cloth') || c.includes('indument') || c.includes('calzado') || c.includes('boutique')) return 'cloth';
  if (c.includes('hogar') || c.includes('home') || c.includes('electr') || c.includes('ferret') || c.includes('mueble')) return 'home';

  return FALLBACK_KEYS[hashString(c) % FALLBACK_KEYS.length];
}

// `index` se mantiene por compatibilidad con los llamadores viejos, pero ya no decide el
// color (ahora es determinístico por nombre).
export function getCategoryStyle(category: string, _index?: number): CategoryStyle {
  return CATEGORY_STYLES[getCategoryKey(category)];
}

// Cuatro direcciones literales; se elige por hash del `seed` (el storeId) para que dos
// tiendas del mismo rubro no tengan un placeholder idéntico.
const GRADIENT_DIRECTIONS = ['bg-gradient-to-br', 'bg-gradient-to-tr', 'bg-gradient-to-r', 'bg-gradient-to-bl'];

export function getCategoryGradient(category: string, seed?: string) {
  const style = getCategoryStyle(category);
  const direction = GRADIENT_DIRECTIONS[hashString(seed || category || 'x') % GRADIENT_DIRECTIONS.length];
  return { gradient: style.gradient, direction, icon: style.icon };
}
