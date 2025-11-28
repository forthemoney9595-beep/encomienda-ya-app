'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
// ✅ CORRECCIÓN: Importamos desde @/lib/firebase
import { useFirestore } from '@/lib/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, query, serverTimestamp, orderBy, onSnapshot } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
// ✅ CORRECCIÓN: Agregamos 'Search' que faltaba en los imports
import { Plus, Pencil, Trash2, Package, Image as ImageIcon, Loader2, Star, ExternalLink, Eye, EyeOff, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
// ✅ IMPORTANTE: Componente de imagen
import { ImageUpload } from '@/components/image-upload';

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
  
  // Estado local para los productos (reemplaza useCollection)
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  // Estado del formulario
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'Comida',
    imageUrl: '',
    available: true,
    isFeatured: false
  });

  // Seguridad: Redirigir si no es tienda
  useEffect(() => {
    if (!authLoading && (!user || userProfile?.role !== 'store')) {
      router.push('/');
    }
  }, [authLoading, user, userProfile, router]);

  // ✅ Lógica de Carga en Tiempo Real (Snapshot)
  useEffect(() => {
    if (!firestore || !userProfile?.storeId) return;

    const q = query(
        collection(firestore, 'stores', userProfile.storeId, 'items'),
        orderBy('createdAt', 'desc') 
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Product));
        setProducts(items);
        setProductsLoading(false);
    }, (error) => {
        console.error("Error fetching products:", error);
        setProductsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, userProfile?.storeId]);

  // Filtrado
  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Abrir Modal
  const openDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description,
        price: product.price.toString(),
        category: product.category,
        imageUrl: product.imageUrl,
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

  // ✅ Callback para actualizar la URL cuando se sube la imagen
  const handleImageUploaded = (url: string) => {
      setFormData(prev => ({ ...prev, imageUrl: url }));
  };

  // Guardar Producto
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
        // Usamos la URL del form (que viene del upload) o un placeholder si está vacío
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

  // Alternar disponibilidad
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

  // Alternar destacado
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
    if (!confirm("¿Estás seguro de eliminar este producto?")) return;

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
        </div>

      <div className="mb-6 max-w-md relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar producto..." 
          className="pl-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Lista de Productos */}
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
                    alt={product.name} 
                    className={`w-full h-full object-cover transition-transform group-hover:scale-105 ${!product.available ? 'grayscale' : ''}`}
                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400?text=Error+Imagen'; }}
                  />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                )}
                
                <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                    <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-md">{product.category}</span>
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
                  <CardTitle className="text-lg line-clamp-1" title={product.name}>{product.name}</CardTitle>
                  <span className="font-bold text-green-600 flex items-center">
                    ${product.price.toFixed(2)}
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
            
            {/* ✅ ZONA DE CARGA DE IMAGEN */}
            <div className="grid gap-2">
                <Label>Imagen del Producto</Label>
                <ImageUpload 
                    currentImageUrl={formData.imageUrl}
                    onImageUploaded={handleImageUploaded}
                    folder="products"
                    variant="banner" // Usamos estilo rectangular
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