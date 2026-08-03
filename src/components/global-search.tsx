'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Search, Store as StoreIcon, ShoppingBag, Heart, User, LayoutGrid, Loader2 } from 'lucide-react';
import { DialogTitle } from '@/components/ui/dialog';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { useFirestore } from '@/lib/firebase';
import { useCart } from '@/context/cart-context';
import { getCategoryStyle } from '@/lib/category-style';
import { cn } from '@/lib/utils';

interface StoreLite {
  id: string;
  name: string;
  category?: string;
  manuallyPaused?: boolean;
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Buscador global (⌘K / Ctrl+K): tiendas, rubros y accesos rápidos.
 *
 * OJO costo (regla de las Fases Y/Z): este diálogo vive en el shell, o sea en TODAS las
 * páginas. Por eso las tiendas se traen con `getDocs` UNA sola vez, recién la primera vez
 * que el usuario abre el buscador, y quedan cacheadas en estado. Un `onSnapshot` acá
 * multiplicaría la lectura de `stores` por cada navegación.
 *
 * A propósito NO busca productos de todas las tiendas: eso necesitaría
 * `collectionGroup('items')`, que es una colección sin techo.
 */
export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const firestore = useFirestore();
  const { setCartSheetOpen } = useCart();
  const [stores, setStores] = useState<StoreLite[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Carga perezosa: solo al abrir por primera vez.
  useEffect(() => {
    if (!open || stores !== null || !firestore || loading) return;
    setLoading(true);
    getDocs(query(collection(firestore, 'stores'), where('isApproved', '==', true)))
      .then(snap => setStores(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))))
      .catch(err => { console.error(err); setStores([]); })
      .finally(() => setLoading(false));
  }, [open, stores, firestore, loading]);

  const go = useCallback((fn: () => void) => { onOpenChange(false); fn(); }, [onOpenChange]);

  const categories = Array.from(new Set((stores || []).map(s => s.category).filter(Boolean))) as string[];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* Radix pide un título accesible; el DialogContent de este proyecto no trae uno. */}
      <DialogTitle className="sr-only">Buscar</DialogTitle>
      <CommandInput placeholder="Buscar tiendas, rubros o secciones..." />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando tiendas...
          </div>
        )}
        <CommandEmpty>No encontramos nada con ese nombre.</CommandEmpty>

        {(stores || []).length > 0 && (
          <CommandGroup heading="Tiendas">
            {(stores || []).map(s => {
              const style = getCategoryStyle(s.category || '');
              const Icon = style.icon;
              return (
                <CommandItem
                  key={s.id}
                  value={`${s.name} ${s.category || ''}`}
                  onSelect={() => go(() => router.push(`/stores/${s.id}`))}
                >
                  <span className={cn('mr-2 flex h-7 w-7 items-center justify-center rounded-lg', style.bg)}>
                    <Icon className={cn('h-4 w-4', style.text)} />
                  </span>
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.category && <span className="ml-2 text-xs text-muted-foreground">{s.category}</span>}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {categories.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Rubros">
              {categories.map(cat => {
                const style = getCategoryStyle(cat);
                const Icon = style.icon;
                return (
                  <CommandItem
                    key={cat}
                    value={`rubro ${cat}`}
                    onSelect={() => go(() => router.push(`/?category=${encodeURIComponent(cat)}`))}
                  >
                    <Icon className={cn('mr-2 h-4 w-4', style.text)} />
                    Ver todo en {cat}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Ir a">
          <CommandItem value="inicio tiendas" onSelect={() => go(() => router.push('/'))}>
            <LayoutGrid className="mr-2 h-4 w-4" /> Inicio
          </CommandItem>
          <CommandItem value="mis pedidos" onSelect={() => go(() => router.push('/orders'))}>
            <ShoppingBag className="mr-2 h-4 w-4" /> Mis Pedidos
          </CommandItem>
          <CommandItem value="favoritos" onSelect={() => go(() => router.push('/favorites'))}>
            <Heart className="mr-2 h-4 w-4" /> Mis Favoritos
          </CommandItem>
          <CommandItem value="perfil cuenta" onSelect={() => go(() => router.push('/profile'))}>
            <User className="mr-2 h-4 w-4" /> Mi Perfil
          </CommandItem>
          <CommandItem value="carrito" onSelect={() => go(() => setCartSheetOpen(true))}>
            <StoreIcon className="mr-2 h-4 w-4" /> Abrir carrito
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Atajo de teclado ⌘K / Ctrl+K. Ignora los inputs para no pisar otros buscadores. */
export function useGlobalSearchShortcut(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'k' || !(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}

/** Botón con pinta de input que abre el buscador (para el header). */
export function GlobalSearchTrigger({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground',
        className,
      )}
    >
      <Search className="h-4 w-4" />
      <span className="hidden sm:inline">Buscar tiendas...</span>
      <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
        ⌘K
      </kbd>
    </button>
  );
}
