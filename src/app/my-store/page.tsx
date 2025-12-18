'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Store as StoreIcon, LocateFixed, CheckCircle2, Clock } from 'lucide-react';
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
  
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Estado para Horarios (Nuevo)
  const [schedule, setSchedule] = useState({ open: '09:00', close: '22:00' });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    address: '',
    imageUrl: '', 
    deliveryTime: '',
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
          });
          
          if (data.coords) {
              setCoords(data.coords);
          }

          // Cargar Horarios si existen
          if (data.schedule) {
              setSchedule(data.schedule);
          }
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUploaded = (url: string) => {
    setFormData(prev => ({ ...prev, imageUrl: url }));
  };

  // Función GPS
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
        toast({ variant: "destructive", title: "Error", description: "Tu navegador no soporta geolocalización." });
        return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            setCoords({ latitude, longitude });
            if(!formData.address) {
                setFormData(prev => ({ ...prev, address: `Ubicación GPS (${latitude.toFixed(4)}, ${longitude.toFixed(4)})` }));
            }
            setIsLocating(false);
            toast({ title: "¡Ubicación Detectada!", description: "Coordenadas de tu tienda guardadas." });
        },
        (error) => {
            console.error("Error GPS:", error);
            setIsLocating(false);
            toast({ variant: "destructive", title: "Error GPS", description: "No pudimos obtener tu ubicación. Asegúrate de permitir el acceso." });
        },
        { enableHighAccuracy: true }
    );
  };

  // 4. Guardar cambios
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !userProfile?.storeId || !user) return;

    setIsSaving(true);
    try {
      const storeRef = doc(firestore, 'stores', userProfile.storeId);
      await updateDoc(storeRef, {
        name: formData.name,
        description: formData.description,
        address: formData.address,
        imageUrl: formData.imageUrl,
        deliveryTime: formData.deliveryTime,
        
        schedule: schedule, // ✅ Guardamos el horario
        coords: coords, 
        
        updatedAt: new Date()
      });

      // Sincronizar foto con perfil de usuario (opcional, pero visualmente útil)
      if (formData.imageUrl) {
          const userRef = doc(firestore, 'users', user.uid);
          await updateDoc(userRef, {
              profileImageUrl: formData.imageUrl,
              photoURL: formData.imageUrl
          });
      }

      toast({
        title: "Tienda actualizada",
        description: "La información, horarios y ubicación se han guardado.",
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
          
          {/* SECCIÓN DE IMAGEN */}
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
            
            {/* INPUT DIRECCIÓN CON BOTÓN GPS */}
            <div className="space-y-2">
                <Label htmlFor="address">Dirección del Local</Label>
                <div className="flex gap-2">
                    <Input 
                        id="address" 
                        name="address" 
                        value={formData.address} 
                        onChange={handleChange} 
                        placeholder="Calle 123, Ciudad" 
                        className="flex-1"
                    />
                    <Button 
                        type="button" 
                        variant="outline" 
                        size="icon"
                        onClick={handleGetLocation}
                        disabled={isLocating}
                        title="Detectar mi ubicación actual (GPS)"
                    >
                        {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4 text-blue-600" />}
                    </Button>
                </div>
                {coords ? (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3"/> Ubicación GPS guardada
                    </p>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        Recomendado: Usa el botón GPS para que el mapa de entregas funcione.
                    </p>
                )}
            </div>
          </div>

          {/* ✅ NUEVA SECCIÓN DE HORARIOS */}
          <div className="grid gap-4 md:grid-cols-2 border p-4 rounded-lg bg-muted/20">
             <div className="md:col-span-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-primary" /> Horarios de Atención
                </h4>
             </div>
             <div className="space-y-2">
                <Label htmlFor="openTime">Apertura</Label>
                <Input 
                    id="openTime" 
                    type="time" 
                    value={schedule.open} 
                    onChange={(e) => setSchedule({...schedule, open: e.target.value})} 
                />
             </div>
             <div className="space-y-2">
                <Label htmlFor="closeTime">Cierre</Label>
                <Input 
                    id="closeTime" 
                    type="time" 
                    value={schedule.close} 
                    onChange={(e) => setSchedule({...schedule, close: e.target.value})} 
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