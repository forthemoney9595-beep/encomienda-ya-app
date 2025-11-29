'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, query, serverTimestamp, onSnapshot } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Package, Image as ImageIcon, Loader2, Star, ExternalLink, Eye, EyeOff, Search, Bug, AlertTriangle } from 'lucide-react'; 
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ImageUpload } from '@/components/image-upload';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  available?: boolean;
  isFeatured?: boolean;
  createdAt?: any;
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

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'Comida',
    imageUrl: '',
    available: true,
    isFeatured: false
  });

  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'store')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  // Lógica de Carga (Trae TODO sin filtros)
  useEffect(() => {
    if (!firestore || !userProfile?.storeId) return;

    const q = query(collection(firestore, 'stores', userProfile.storeId, 'items'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Product));

        items.sort((a, b) => {
            const dateA = a.createdAt?.seconds || 0;
            const dateB = b.createdAt?.seconds || 0;
            return dateB - dateA;
        });

        setProducts(items);
        setProductsLoading(false);
    }, (error) => {
        console.error("Error fetching products:", error);
        setProductsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, userProfile?.storeId]);

  const filteredProducts = products.filter(product => {
    const name = (product.name || '').toLowerCase();
    const category = (product.category || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return name.includes(search) || category.includes(search);
  });

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
        isFeatured: product.isFeatured || false
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        description: '',
        price: '',
        category: 'Comida',
        imageUrl: '',
        available: true,
        isFeatured: false
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
        updatedAt: serverTimestamp()
      };

      if (editingProduct) {
        const docRef = doc(firestore, 'stores', userProfile.storeId, 'items', editingProduct.id);
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
      const docRef = doc(firestore, 'stores', userProfile.storeId, 'items', product.id);
      await updateDoc(docRef, { available: !product.available });
      toast({ title: "Disponibilidad actualizada" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error" });
    }
  };

  const toggleFeatured = async (product: Product) => {
    if (!firestore || !userProfile?.storeId) return;
    try {
      const docRef = doc(firestore, 'stores', userProfile.storeId, 'items', product.id);
      await updateDoc(docRef, { isFeatured: !product.isFeatured });
      toast({ title: !product.isFeatured ? "Producto Destacado" : "Producto ya no es destacado" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error" });
    }
  };

  const handleDelete = async (productId: string) => {
    if (!firestore || !userProfile?.storeId) return;
    if (!confirm("¿Estás seguro de eliminar este producto permanentemente?")) return;

    try {
      const docRef = doc(firestore, 'stores', userProfile.storeId, 'items', productId);
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
           <Card className="mb-8 border-red-200 bg-red-50/20">
               <CardHeader>
                   <CardTitle className="text-red-700 flex items-center gap-2">
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
                                           {p.name ? p.name : <span className="text-red-600 font-bold">⚠️ SIN NOMBRE</span>}
                                       </TableCell>
                                       <TableCell>
                                           <Button variant="destructive" size="sm" onClick={() => handleDelete(p.id)}>
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

      <div className="mb-6 max-w-md relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar producto..." 
          className="pl-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

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
            <Card key={product.id} className={`flex flex-col overflow-hidden group hover:shadow-lg transition-shadow ${!product.available ? 'opacity-75 border-dashed' : ''} ${product.isFeatured ? 'ring-2 ring-yellow-400' : ''}`}>
              <div className="relative h-48 w-full bg-muted flex items-center justify-center overflow-hidden">
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
                        <span className="bg-yellow-400 text-yellow-900 text-xs px-2 py-1 rounded-md font-bold flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-900" /> TOP
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
                  <CardTitle className={`text-lg line-clamp-1 ${!product.name ? 'text-red-500 italic' : ''}`} title={product.name}>
                      {product.name || '⚠️ Sin Nombre'}
                  </CardTitle>
                  <span className="font-bold text-green-600 flex items-center">
                    ${(product.price || 0).toFixed(2)}
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
                    className={`h-8 w-8 ${product.available ? 'text-green-600' : 'text-muted-foreground'}`}
                    onClick={() => toggleAvailability(product)}
                    title={product.available ? "Marcar como Agotado" : "Marcar como Disponible"}
                    >
                    {product.available ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    
                    <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-8 w-8 ${product.isFeatured ? 'text-yellow-500' : 'text-muted-foreground'}`}
                    onClick={() => toggleFeatured(product)}
                    >
                    <Star className={`h-4 w-4 ${product.isFeatured ? 'fill-current' : ''}`} />
                    </Button>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openDialog(product)}>
                    <Pencil className="mr-2 h-3 w-3" /> Editar
                    </Button>
                    <Button variant="destructive" size="icon" className="h-9 w-9" onClick={() => handleDelete(product.id)}>
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
                    <SelectItem value="Comida">Comida</SelectItem>
                    <SelectItem value="Bebidas">Bebidas</SelectItem>
                    <SelectItem value="Ropa">Ropa</SelectItem>
                    <SelectItem value="Electrónica">Electrónica</SelectItem>
                    <SelectItem value="Hogar">Hogar</SelectItem>
                    <SelectItem value="Otros">Otros</SelectItem>
                  </SelectContent>
                </Select>
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