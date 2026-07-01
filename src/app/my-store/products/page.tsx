'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, query, serverTimestamp, onSnapshot, writeBatch } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Package, Image as ImageIcon, Loader2, Star, ExternalLink, Eye, EyeOff, Search, Bug, AlertTriangle, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ImageUpload } from '@/components/image-upload';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Fallback cuando la tienda todavía no definió sus propias categorías en
// /my-store/categories — coincide con la lista fija que había antes hardcodeada acá.
const DEFAULT_CATEGORIES = ['Comida', 'Bebidas', 'Ropa', 'Electrónica', 'Hogar', 'Otros'];

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  available?: boolean;
  isFeatured?: boolean;
  // Opcional: sin valor = sin límite (no rompe productos existentes que nunca tuvieron
  // este campo). Si está definido, /api/orders/create lo valida y lo descuenta.
  stock?: number | null;
  // Opcional, 0-90. Si está definido, /api/orders/create lo aplica al precio real
  // antes de sumar al subtotal (nunca se confía en un precio con descuento del cliente).
  discountPercent?: number | null;
  createdAt?: any;
  // De qué subcolección vino ('items' es la actual, 'products' es legacy) — determina
  // a qué colección apuntar al editar/borrar este producto puntual.
  sourceCollection?: 'items' | 'products';
}

export default function ProductManagementPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // ✅ VUELVE A FALSE PARA QUE NO MOLESTE
  const [showDebug, setShowDebug] = useState(false); 
  
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  // Categorías definidas por el dueño en /my-store/categories. El <Select> de abajo las usa
  // en vez de una lista fija, para que la categoría del producto y el agrupado de la tienda
  // pública (que agrupa por product.category) queden siempre en sync.
  const [storeCategories, setStoreCategories] = useState<string[]>([]);
  // Máximo descuento vigente guardado hoy en el doc de la tienda (para no reescribirlo si
  // no cambió). El home muestra un badge de ofertas basado en este campo — ver el efecto
  // de sincronización más abajo.
  const [storeMaxDiscount, setStoreMaxDiscount] = useState(0);
  // Filtro por estado de stock + selección para acciones masivas.
  const [stockFilter, setStockFilter] = useState<'all' | 'available' | 'out' | 'low'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkWorking, setIsBulkWorking] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'Comida',
    imageUrl: '',
    available: true,
    isFeatured: false,
    stock: '',
    discountPercent: ''
  });

  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'store')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  // Lógica de Carga (Trae TODO sin filtros) — escuchamos 'items' (actual) y 'products'
  // (legacy) por separado y los combinamos, así no se "pierden" productos de tiendas
  // viejas que todavía tengan su catálogo en la subcolección anterior.
  useEffect(() => {
    if (!firestore || !userProfile?.storeId) return;

    let itemsDocs: Product[] = [];
    let productsDocs: Product[] = [];
    let itemsLoaded = false;
    let productsLoaded = false;

    const mergeAndSet = () => {
        if (!itemsLoaded || !productsLoaded) return;
        const merged = [...itemsDocs, ...productsDocs];
        merged.sort((a, b) => {
            const dateA = a.createdAt?.seconds || 0;
            const dateB = b.createdAt?.seconds || 0;
            return dateB - dateA;
        });
        setProducts(merged);
        setProductsLoading(false);
    };

    const qItems = query(collection(firestore, 'stores', userProfile.storeId, 'items'));
    const unsubItems = onSnapshot(qItems, (snapshot) => {
        itemsDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), sourceCollection: 'items' } as Product));
        itemsLoaded = true;
        mergeAndSet();
    }, (error) => {
        console.error("Error fetching products (items):", error);
        itemsLoaded = true;
        mergeAndSet();
    });

    const qProducts = query(collection(firestore, 'stores', userProfile.storeId, 'products'));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
        productsDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), sourceCollection: 'products' } as Product));
        productsLoaded = true;
        mergeAndSet();
    }, (error) => {
        console.error("Error fetching products (legacy 'products'):", error);
        productsLoaded = true;
        mergeAndSet();
    });

    return () => { unsubItems(); unsubProducts(); };
  }, [firestore, userProfile?.storeId]);

  // Categorías del dueño (en vivo, así si las edita en /my-store/categories se refleja acá).
  // Aprovecho la misma suscripción para leer el maxDiscountPercent actual de la tienda.
  useEffect(() => {
    if (!firestore || !userProfile?.storeId) return;
    const unsub = onSnapshot(doc(firestore, 'stores', userProfile.storeId), (snap) => {
      const data = snap.data();
      const cats = data?.productCategories;
      setStoreCategories(Array.isArray(cats) ? cats.filter(Boolean) : []);
      setStoreMaxDiscount(data?.maxDiscountPercent || 0);
    }, () => setStoreCategories([]));
    return () => unsub();
  }, [firestore, userProfile?.storeId]);

  // Mantiene stores/{id}.maxDiscountPercent = el mayor descuento entre productos que hoy se
  // pueden comprar (disponibles y con stock). El panel de productos es el único lugar donde
  // cambia el catálogo, así que alcanza con recalcular acá. El home usa este campo para el
  // badge de ofertas sin tener que leer los productos de cada tienda (ver Fase V bis).
  useEffect(() => {
    if (!firestore || !userProfile?.storeId || productsLoading) return;
    const computed = products.reduce((max, p) => {
      const buyable = p.available !== false && (p.stock == null || p.stock > 0);
      const d = buyable ? (p.discountPercent || 0) : 0;
      return Math.max(max, d);
    }, 0);
    if (computed !== storeMaxDiscount) {
      updateDoc(doc(firestore, 'stores', userProfile.storeId), { maxDiscountPercent: computed }).catch(() => {});
    }
  }, [products, productsLoading, storeMaxDiscount, firestore, userProfile?.storeId]);

  // Opciones del selector: las del dueño si definió alguna, si no el fallback. Además nos
  // aseguramos de incluir la categoría del producto que se está editando aunque ya no esté
  // en la lista, para no perderla silenciosamente al guardar.
  const categoryOptions = (() => {
    const base = storeCategories.length > 0 ? storeCategories : DEFAULT_CATEGORIES;
    const current = editingProduct?.category?.trim();
    return current && !base.includes(current) ? [current, ...base] : base;
  })();

  const matchesStock = (p: Product) => {
    switch (stockFilter) {
      case 'available': return p.available !== false;
      case 'out': return p.available === false || (p.stock != null && p.stock <= 0);
      case 'low': return p.stock != null && p.stock > 0 && p.stock <= 3;
      default: return true;
    }
  };

  const filteredProducts = products.filter(product => {
    const name = (product.name || '').toLowerCase();
    const category = (product.category || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    const matchesSearch = name.includes(search) || category.includes(search);
    return matchesSearch && matchesStock(product);
  });

  // --- Selección + acciones masivas ---
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const allVisibleSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id));
  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      if (filteredProducts.every(p => prev.has(p.id))) {
        const next = new Set(prev);
        filteredProducts.forEach(p => next.delete(p.id));
        return next;
      }
      const next = new Set(prev);
      filteredProducts.forEach(p => next.add(p.id));
      return next;
    });
  };

  const selectedProducts = products.filter(p => selectedIds.has(p.id));

  const bulkSetAvailability = async (available: boolean) => {
    if (!firestore || !userProfile?.storeId || selectedProducts.length === 0) return;
    setIsBulkWorking(true);
    try {
      const batch = writeBatch(firestore);
      selectedProducts.forEach(p => {
        batch.update(doc(firestore, 'stores', userProfile.storeId!, p.sourceCollection || 'items', p.id), { available });
      });
      await batch.commit();
      toast({ title: available ? 'Marcados como disponibles' : 'Marcados como agotados', description: `${selectedProducts.length} producto(s).` });
      clearSelection();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo aplicar la acción.' });
    } finally {
      setIsBulkWorking(false);
    }
  };

  const bulkDelete = async () => {
    if (!firestore || !userProfile?.storeId || selectedProducts.length === 0) return;
    if (!confirm(`¿Eliminar ${selectedProducts.length} producto(s) permanentemente?`)) return;
    setIsBulkWorking(true);
    try {
      const batch = writeBatch(firestore);
      selectedProducts.forEach(p => {
        batch.delete(doc(firestore, 'stores', userProfile.storeId!, p.sourceCollection || 'items', p.id));
      });
      await batch.commit();
      toast({ title: 'Productos eliminados', description: `${selectedProducts.length} producto(s).` });
      clearSelection();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron eliminar.' });
    } finally {
      setIsBulkWorking(false);
    }
  };

  const openDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name || '',
        description: product.description || '',
        price: product.price ? product.price.toString() : '',
        category: product.category || 'Comida',
        imageUrl: product.imageUrl || '',
        available: product.available !== undefined ? product.available : true,
        isFeatured: product.isFeatured || false,
        stock: product.stock != null ? product.stock.toString() : '',
        discountPercent: product.discountPercent != null ? product.discountPercent.toString() : ''
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        description: '',
        price: '',
        category: (storeCategories.length > 0 ? storeCategories : DEFAULT_CATEGORIES)[0],
        imageUrl: '',
        available: true,
        isFeatured: false,
        stock: '',
        discountPercent: ''
      });
    }
    setIsDialogOpen(true);
  };

  const handleImageUploaded = (url: string) => {
      setFormData(prev => ({ ...prev, imageUrl: url }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !userProfile?.storeId) return;

    if (formData.discountPercent.trim() !== '') {
      const pct = Number(formData.discountPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 90) {
        toast({ variant: 'destructive', title: 'Descuento inválido', description: 'Tiene que ser un número entre 0 y 90.' });
        return;
      }
    }

    setIsLoadingAction(true);
    try {
      const productData: any = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        category: formData.category,
        imageUrl: formData.imageUrl || 'https://placehold.co/400?text=Sin+Imagen',
        available: formData.available,
        isFeatured: formData.isFeatured,
        // null = sin límite de stock; explícito para poder "borrar" el límite en una edición
        stock: formData.stock.trim() === '' ? null : parseInt(formData.stock, 10),
        discountPercent: formData.discountPercent.trim() === '' ? null : parseInt(formData.discountPercent, 10),
        updatedAt: serverTimestamp()
      };

      if (editingProduct) {
        const docRef = doc(firestore, 'stores', userProfile.storeId, editingProduct.sourceCollection || 'items', editingProduct.id);
        await updateDoc(docRef, productData);
        toast({ title: "Producto actualizado" });
      } else {
        productData.createdAt = serverTimestamp(); 
        const colRef = collection(firestore, 'stores', userProfile.storeId, 'items');
        await addDoc(colRef, productData);
        toast({ title: "Producto creado" });
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "No se pudo guardar." });
    } finally {
      setIsLoadingAction(false);
    }
  };

  const toggleAvailability = async (product: Product) => {
    if (!firestore || !userProfile?.storeId) return;
    try {
      const docRef = doc(firestore, 'stores', userProfile.storeId, product.sourceCollection || 'items', product.id);
      await updateDoc(docRef, { available: !product.available });
      toast({ title: "Disponibilidad actualizada" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error" });
    }
  };

  const toggleFeatured = async (product: Product) => {
    if (!firestore || !userProfile?.storeId) return;
    try {
      const docRef = doc(firestore, 'stores', userProfile.storeId, product.sourceCollection || 'items', product.id);
      await updateDoc(docRef, { isFeatured: !product.isFeatured });
      toast({ title: !product.isFeatured ? "Producto Destacado" : "Producto ya no es destacado" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error" });
    }
  };

  const handleDelete = async (product: Product) => {
    if (!firestore || !userProfile?.storeId) return;
    if (!confirm("¿Estás seguro de eliminar este producto permanentemente?")) return;

    try {
      const docRef = doc(firestore, 'stores', userProfile.storeId, product.sourceCollection || 'items', product.id);
      await deleteDoc(docRef);
      toast({ title: "Producto eliminado" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error" });
    }
  };

  if (authLoading || productsLoading) {
    return (
      <div className="container mx-auto space-y-4">
        <PageHeader title="Cargando Inventario..." description="Preparando tus productos." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto pb-20">
      <PageHeader 
        title="Gestión de Productos" 
        description="Añade, edita o elimina los productos que ofreces en tu tienda."
      />
       <div className="flex gap-2 mb-6">
            <Link href={`/stores/${userProfile?.storeId}`} target="_blank">
                <Button variant="outline">
                    <ExternalLink className="mr-2 h-4 w-4" /> Ver mi Tienda
                </Button>
            </Link>
            <Button onClick={() => openDialog()}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo Producto
            </Button>
            {/* Botón discreto para activar modo limpieza si se necesita en el futuro */}
            <Button variant="ghost" size="icon" onClick={() => setShowDebug(!showDebug)} title="Modo Limpieza">
                <Bug className="h-4 w-4 text-muted-foreground/50" />
            </Button>
        </div>

       {/* ✅ TABLA DE LIMPIEZA (Solo visible si activas el bichito) */}
       {showDebug && (
           <Card className="mb-8 border-destructive/30 bg-destructive/10">
               <CardHeader>
                   <CardTitle className="text-destructive flex items-center gap-2">
                        <Trash2 className="h-5 w-5"/> MODO LIMPIEZA ACTIVADO
                   </CardTitle>
                   <CardDescription>Aquí aparecen TODOS los items. Borra los que no tengan nombre.</CardDescription>
               </CardHeader>
               <CardContent>
                   <Table>
                       <TableHeader>
                           <TableRow>
                               <TableHead>ID Documento</TableHead>
                               <TableHead>Nombre</TableHead>
                               <TableHead>Acción</TableHead>
                           </TableRow>
                       </TableHeader>
                       <TableBody>
                           {products.length === 0 ? (
                               <TableRow>
                                   <TableCell colSpan={3} className="text-center text-muted-foreground">
                                       Base de datos vacía para este ID de tienda.
                                   </TableCell>
                               </TableRow>
                           ) : (
                               products.map(p => (
                                   <TableRow key={p.id}>
                                       <TableCell className="font-mono text-xs">{p.id}</TableCell>
                                       <TableCell>
                                           {p.name ? p.name : <span className="text-destructive font-bold">⚠️ SIN NOMBRE</span>}
                                       </TableCell>
                                       <TableCell>
                                           <Button variant="destructive" size="sm" onClick={() => handleDelete(p)}>
                                               ELIMINAR
                                           </Button>
                                       </TableCell>
                                   </TableRow>
                               ))
                           )}
                       </TableBody>
                   </Table>
               </CardContent>
           </Card>
       )}

      <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as any)}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="available">Disponibles</SelectItem>
            <SelectItem value="out">Agotados / no visibles</SelectItem>
            <SelectItem value="low">Stock bajo (≤3)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Barra de acciones masivas */}
      {filteredProducts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAllVisible} />
            Seleccionar todos
          </label>
          {selectedIds.size > 0 ? (
            <>
              <span className="text-sm text-muted-foreground">{selectedIds.size} seleccionado(s)</span>
              <div className="flex flex-wrap gap-2 ml-auto">
                <Button size="sm" variant="outline" disabled={isBulkWorking} onClick={() => bulkSetAvailability(true)}>
                  <Eye className="mr-2 h-4 w-4" /> Disponible
                </Button>
                <Button size="sm" variant="outline" disabled={isBulkWorking} onClick={() => bulkSetAvailability(false)}>
                  <EyeOff className="mr-2 h-4 w-4" /> Agotado
                </Button>
                <Button size="sm" variant="destructive" disabled={isBulkWorking} onClick={bulkDelete}>
                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                </Button>
                <Button size="sm" variant="ghost" disabled={isBulkWorking} onClick={clearSelection}>
                  <X className="mr-2 h-4 w-4" /> Limpiar
                </Button>
              </div>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Tildá productos para acciones masivas</span>
          )}
        </div>
      )}

      {(!filteredProducts || filteredProducts.length === 0) ? (
        <div className="text-center py-12 bg-muted/20 rounded-xl border-2 border-dashed">
          <Package className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium">
            {searchTerm ? 'No se encontraron productos' : 'Tu inventario está vacío'}
          </h3>
          {!searchTerm && <Button onClick={() => openDialog()} className="mt-4">Crear Primer Producto</Button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <Card key={product.id} className={`flex flex-col overflow-hidden group hover:shadow-lg transition-shadow ${!product.available ? 'opacity-75 border-dashed' : ''} ${selectedIds.has(product.id) ? 'ring-2 ring-primary' : product.isFeatured ? 'ring-2 ring-warning' : ''}`}>
              <div className="relative h-48 w-full bg-muted flex items-center justify-center overflow-hidden">
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox
                    checked={selectedIds.has(product.id)}
                    onCheckedChange={() => toggleSelect(product.id)}
                    className="bg-background/80 border-2 shadow-sm"
                  />
                </div>
                {product.imageUrl ? (
                  <img 
                    src={product.imageUrl} 
                    alt={product.name || 'Producto'} 
                    className={`w-full h-full object-cover transition-transform group-hover:scale-105 ${!product.available ? 'grayscale' : ''}`}
                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400?text=Error+Imagen'; }}
                  />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                )}
                
                <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                    <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-md">{product.category || 'Sin cat.'}</span>
                    {product.isFeatured && (
                        <span className="bg-warning text-warning-foreground text-xs px-2 py-1 rounded-md font-bold flex items-center gap-1">
                            <Star className="h-3 w-3 fill-current" /> TOP
                        </span>
                    )}
                    {product.stock != null && (
                        <span className={`text-xs px-2 py-1 rounded-md font-medium ${product.stock <= 3 ? 'bg-destructive text-destructive-foreground' : 'bg-black/70 text-white'}`}>
                            Quedan {product.stock}
                        </span>
                    )}
                    {!!product.discountPercent && (
                        <span className="bg-success text-success-foreground text-xs px-2 py-1 rounded-md font-bold">
                            -{product.discountPercent}%
                        </span>
                    )}
                </div>

                {!product.available && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                    <Badge variant="destructive" className="text-sm px-3 py-1 uppercase border-2"> Agotado </Badge>
                  </div>
                )}
              </div>
              
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className={`text-lg line-clamp-1 ${!product.name ? 'text-destructive italic' : ''}`} title={product.name}>
                      {product.name || '⚠️ Sin Nombre'}
                  </CardTitle>
                  <span className="flex flex-col items-end">
                    {!!product.discountPercent && (
                        <span className="text-xs text-muted-foreground line-through">${(product.price || 0).toFixed(2)}</span>
                    )}
                    <span className="font-bold text-foreground">
                        ${(product.discountPercent ? (product.price || 0) * (1 - product.discountPercent / 100) : (product.price || 0)).toFixed(2)}
                    </span>
                  </span>
                </div>
              </CardHeader>
              
              <CardContent className="p-4 pt-0 flex-1">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {product.description || "Sin descripción"}
                </p>
              </CardContent>

              <CardFooter className="p-4 bg-muted/30 flex gap-1 border-t justify-between">
                <div className="flex gap-1">
                    <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-8 w-8 ${product.available ? 'text-success' : 'text-muted-foreground'}`}
                    onClick={() => toggleAvailability(product)}
                    title={product.available ? "Marcar como Agotado" : "Marcar como Disponible"}
                    >
                    {product.available ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    
                    <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-8 w-8 ${product.isFeatured ? 'text-warning' : 'text-muted-foreground'}`}
                    onClick={() => toggleFeatured(product)}
                    >
                    <Star className={`h-4 w-4 ${product.isFeatured ? 'fill-current' : ''}`} />
                    </Button>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openDialog(product)}>
                    <Pencil className="mr-2 h-3 w-3" /> Editar
                    </Button>
                    <Button variant="destructive" size="icon" className="h-9 w-9" onClick={() => handleDelete(product)}>
                    <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
            <DialogDescription>
              {editingProduct ? 'Modifica los detalles del producto.' : 'Rellena la información para crear un nuevo producto.'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSave} className="space-y-4 py-2">
            
            <div className="grid gap-2">
                <Label>Imagen del Producto</Label>
                <ImageUpload
                    currentImageUrl={formData.imageUrl}
                    onImageUploaded={handleImageUploaded}
                    folder="products"
                    ownerId={userProfile!.storeId!}
                    variant="banner"
                />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input 
                id="name" 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                required 
                placeholder="Ej. Pizza Especial"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="price">Precio ($)</Label>
                <Input 
                    id="price" 
                    type="number" 
                    step="0.01" 
                    value={formData.price} 
                    onChange={(e) => setFormData({...formData, price: e.target.value})} 
                    required 
                    placeholder="0.00"
                  />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Categoría</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({...formData, category: val})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {storeCategories.length === 0 && (
                  <p className="text-[0.7rem] text-muted-foreground">
                    Definí tus propias categorías en <Link href="/my-store/categories" className="underline">Categorías</Link>.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="stock">Stock disponible (opcional)</Label>
                <Input
                  id="stock"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  placeholder="Vacío = ilimitado"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="discountPercent">Descuento % (opcional)</Label>
                <Input
                  id="discountPercent"
                  type="number"
                  min="0"
                  max="90"
                  step="1"
                  value={formData.discountPercent}
                  onChange={(e) => setFormData({ ...formData, discountPercent: e.target.value })}
                  placeholder="Vacío = sin descuento"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea 
                id="description" 
                value={formData.description} 
                onChange={(e) => setFormData({...formData, description: e.target.value})} 
                rows={3}
                placeholder="Ingredientes, detalles, etc."
              />
            </div>

            <div className="flex items-center space-x-2 border p-3 rounded-md bg-muted/20">
                <Switch 
                    id="featured" 
                    checked={formData.isFeatured}
                    onCheckedChange={(checked) => setFormData({...formData, isFeatured: checked})}
                />
                <div className="flex flex-col">
                    <Label htmlFor="featured" className="cursor-pointer">Destacar producto</Label>
                    <span className="text-xs text-muted-foreground">Aparecerá con una estrella y borde especial.</span>
                </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isLoadingAction}>
                {isLoadingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}