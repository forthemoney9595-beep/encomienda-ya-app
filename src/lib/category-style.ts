import { LayoutGrid, Utensils, Shirt, Package, Coffee, Laptop, Pill, ShoppingCart, type LucideIcon } from 'lucide-react';

// Ícono + color por categoría — paleta fija que rota para categorías nuevas/desconocidas.
// Usada tanto por los chips de categoría de tiendas (Inicio) como por los de productos
// dentro de una tienda, para que ambos compartan el mismo lenguaje visual.
export const CATEGORY_STYLES: { icon: LucideIcon; bg: string; text: string }[] = [
  { icon: LayoutGrid, bg: 'bg-primary/15', text: 'text-primary' },
  { icon: Utensils, bg: 'bg-warning/15', text: 'text-warning' },
  { icon: Shirt, bg: 'bg-info/15', text: 'text-info' },
  { icon: Package, bg: 'bg-success/15', text: 'text-success' },
  { icon: Coffee, bg: 'bg-warning/15', text: 'text-warning' },
  { icon: Laptop, bg: 'bg-info/15', text: 'text-info' },
  { icon: Pill, bg: 'bg-destructive/15', text: 'text-destructive' },     // 6 — farmacia
  { icon: ShoppingCart, bg: 'bg-success/15', text: 'text-success' },     // 7 — super/kiosco
];

export function getCategoryStyle(category: string, index: number) {
  const c = category.toLowerCase();
  if (c === 'todas' || c === 'todos') return CATEGORY_STYLES[0];
  if (c.includes('comida') || c.includes('food') || c.includes('pizza') || c.includes('empanada')) return CATEGORY_STYLES[1];
  if (c.includes('ropa') || c.includes('cloth')) return CATEGORY_STYLES[2];
  if (c.includes('bebida') || c.includes('drink')) return CATEGORY_STYLES[4];
  if (c.includes('electr') || c.includes('hogar') || c.includes('home')) return CATEGORY_STYLES[5];
  if (c.includes('farmacia') || c.includes('farmac')) return CATEGORY_STYLES[6];
  if (c.includes('super') || c.includes('kiosco') || c.includes('almac')) return CATEGORY_STYLES[7];
  // Rotación para desconocidas: saltea el índice 0 (LayoutGrid) y los dedicados 6/7.
  return CATEGORY_STYLES[(index % 5) + 1];
}
