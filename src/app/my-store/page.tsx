'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
// ✅ Importamos desde @/lib/firebase para consistencia
import { useFirestore } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Store as StoreIcon } from 'lucide-react';
import PageHeader from '@/components/page-header';
import { ImageUpload } from '@/components/image-upload';
import { useRouter } from 'next/navigation';

export default function MyStorePage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Estado del formulario
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    address: '',
    imageUrl: '', 
    deliveryTime: '',
    minOrder: ''
  });

  // 1. Cargar datos de la tienda
  useEffect(() => {
    const fetchStoreData = async () => {
      if (!user || !userProfile?.storeId || !firestore) return;

      try {
        const storeRef = doc(firestore, 'stores', userProfile.storeId);
        const storeSnap = await getDoc(storeRef);

        if (storeSnap.exists()) {
          const data = storeSnap.data();
          setFormData({
            name: data.name || '',
            description: data.description || '',
            category: data.category || '',
            address: data.address || '',
            imageUrl: data.imageUrl || '',
            deliveryTime: data.deliveryTime || '',
            minOrder: data.minOrder ? String(data.minOrder) : ''
          });
        }
      } catch (error) {
        console.error("Error cargando tienda:", error);
        toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los datos de la tienda." });
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading) {
        if (userProfile?.role !== 'store') {
            router.push('/');
        } else {
            fetchStoreData();
        }
    }
  }, [user, userProfile, firestore, authLoading, router, toast]);

  // 2. Manejar cambios en inputs de texto
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // 3. Callback para actualizar la imagen cuando se sube
  const handleImageUploaded = (url: string) => {
    setFormData(prev => ({ ...prev, imageUrl: url }));
  };

  // 4. Guardar cambios en Firestore
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !userProfile?.storeId || !user) return;

    setIsSaving(true);
    try {
      // A. Actualizar documento de la TIENDA
      const storeRef = doc(firestore, 'stores', userProfile.storeId);
      await updateDoc(storeRef, {
        name: formData.name,
        description: formData.description,
        address: formData.address,
        imageUrl: formData.imageUrl,
        deliveryTime: formData.deliveryTime,
        minOrder: parseFloat(formData.minOrder) || 0,
        updatedAt: new Date()
      });

      // B. ✅ ACTUALIZAR TAMBIÉN EL USUARIO (Para que cambie el avatar de la izquierda)
      // Si cambias la foto de la tienda, asumimos que quieres que sea tu avatar
      if (formData.imageUrl) {
          const userRef = doc(firestore, 'users', user.uid);
          await updateDoc(userRef, {
              profileImageUrl: formData.imageUrl,
              photoURL: formData.imageUrl
          });
      }

      toast({
        title: "Tienda actualizada",
        description: "La información y tu foto de perfil se han actualizado.",
      });
    } catch (error) {
      console.error("Error actualizando tienda:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar la tienda.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || isLoading) {
    return <div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container max-w-3xl mx-auto space-y-6 pb-20">
      <PageHeader 
        title="Editar Mi Tienda" 
        description="Gestiona la apariencia y datos de tu negocio."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StoreIcon className="h-5 w-5" /> Información del Negocio
          </CardTitle>
          <CardDescription>
            Esta información será visible para todos los clientes en la app.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          
          {/* SECCIÓN DE IMAGEN (BANNER) */}
          <div className="space-y-2">
            <Label>Portada de la Tienda</Label>
            <div className="flex justify-center">
                <ImageUpload 
                    currentImageUrl={formData.imageUrl}
                    onImageUploaded={handleImageUploaded}
                    folder="store-banners"
                    variant="banner"
                />
            </div>
            <p className="text-[0.8rem] text-muted-foreground text-center">
                Se recomienda una imagen horizontal de buena calidad.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
                <Label htmlFor="name">Nombre de la Tienda</Label>
                <Input 
                    id="name" 
                    name="name" 
                    value={formData.name} 
                    onChange={handleChange} 
                    placeholder="Ej. Pizzería Don Mario" 
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="address">Dirección del Local</Label>
                <Input 
                    id="address" 
                    name="address" 
                    value={formData.address} 
                    onChange={handleChange} 
                    placeholder="Calle 123, Ciudad" 
                />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea 
                id="description" 
                name="description" 
                value={formData.description} 
                onChange={handleChange} 
                placeholder="Cuenta un poco sobre tu negocio..." 
                rows={3}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
                <Label htmlFor="deliveryTime">Tiempo de Entrega (Estimado)</Label>
                <Input 
                    id="deliveryTime" 
                    name="deliveryTime" 
                    value={formData.deliveryTime} 
                    onChange={handleChange} 
                    placeholder="Ej. 30-45 min" 
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="minOrder">Costo de Envío ($)</Label>
                <Input 
                    id="minOrder" 
                    name="minOrder" 
                    type="number"
                    value={formData.minOrder} 
                    onChange={handleChange} 
                    placeholder="0.00" 
                />
            </div>
          </div>

        </CardContent>
        <CardFooter className="flex justify-between border-t px-6 py-4 bg-muted/20">
            <Button variant="ghost" onClick={() => router.back()}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="mr-2 h-4 w-4" /> Guardar Cambios</>}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}