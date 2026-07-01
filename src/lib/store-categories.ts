// Lista canónica de RUBROS de tienda (el campo `stores/{id}.category`, que el home usa
// para filtrar/armar chips). Fuente de verdad única: la usan el alta (/signup/store),
// el editor (/my-store/edit) y el menú "Explorar Tiendas".
//
// Antes cada lugar tenía su propia versión (el alta un dropdown con rubros de comida
// tipo "italiana/japonesa", el editor texto libre, el menú links hardcodeados), lo que
// fragmentaba las categorías: "Comida Rápida" vs "comida-rapida" vs "Comida" contaban
// como rubros distintos. Pensada para un marketplace general de pueblo (Tinogasta), no
// solo gastronómico.
//
// OJO: es distinto de `stores/{id}.productCategories` (secciones internas de productos,
// se gestiona en /my-store/categories) y de `product.category` (agrupa el menú de la
// tienda pública). Ver los 3 conceptos de categoría documentados en CLAUDE.md.
export const STORE_CATEGORIES = [
  'Comida',
  'Bebidas',
  'Kiosco',
  'Farmacia',
  'Supermercado',
  'Ropa',
  'Hogar',
  'Otros',
] as const;

export type StoreCategory = (typeof STORE_CATEGORIES)[number];
