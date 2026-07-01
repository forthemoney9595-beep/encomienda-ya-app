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
import { Loader2, Save, Store as StoreIcon, LocateFixed, CheckCircle2, Clock, MapPin, AlertTriangle, PauseCircle } from 'lucide-react';
import PageHeader from '@/components/page-header';
import { ImageUpload } from '@/components/image-upload';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';

export default function MyStorePage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Estado para Horarios
  const [schedule, setSchedule] = useState({ open: '09:00', close: '22:00' });

  // Pausa manual: se guarda al toque (no espera a "Guardar Cambios") porque es una
  // acción de emergencia ("me quedé sin stock/personal"), no un dato de perfil.
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);

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

          setManuallyPaused(!!data.manuallyPaused);
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

  // ✅ FUNCIÓN GPS CORREGIDA (NO INSERTA TEXTO FEO)
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
            // 🚫 ELIMINADO: Ya no sobreescribimos el address con coordenadas feas
            setIsLocating(false);
            toast({ title: "¡Ubicación Detectada!", description: "Coordenadas guardadas internamente." });
        },
        (error) => {
            console.error("Error GPS:", error);
            setIsLocating(false);
            toast({ variant: "destructive", title: "Error GPS", description: "Asegúrate de permitir el acceso a tu ubicación." });
        },
        { enableHighAccuracy: true }
    );
  };

  // 4. Guardar cambios
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !userProfile?.storeId || !user) return;

    // VALIDACIÓN: Si hay GPS pero no hay dirección escrita, avisar
    if (coords && (!formData.address || formData.address.trim() === '' || formData.address.includes('Ubicación GPS'))) {
        toast({ 
            variant: "destructive", 
            title: "Falta Dirección Escrita", 
            description: "Por favor escribe la calle y número (ej: San Martín 500) para que los clientes te encuentren fácil." 
        });
        return;
    }

    setIsSaving(true);
    try {
      const storeRef = doc(firestore, 'stores', userProfile.storeId);
      await updateDoc(storeRef, {
        name: formData.name,
        description: formData.description,
        category: formData.category, // Rubro editable (filtro del inicio)
        address: formData.address, // Guardamos lo que escribió el usuario
        imageUrl: formData.imageUrl,
        deliveryTime: formData.deliveryTime,
        
        schedule: schedule, 
        coords: coords, 
        
        updatedAt: new Date()
      });

      if (formData.imageUrl) {
          const userRef = doc(firestore, 'users', user.uid);
          await updateDoc(userRef, {
              profileImageUrl: formData.imageUrl,
              photoURL: formData.imageUrl
          });
      }

      toast({
        title: "Tienda actualizada",
        description: "Tu información está lista para recibir pedidos.",
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

  const handleTogglePause = async (checked: boolean) => {
    if (!firestore || !userProfile?.storeId) return;
    setIsTogglingPause(true);
    try {
      await updateDoc(doc(firestore, 'stores', userProfile.storeId), { manuallyPaused: checked });
      setManuallyPaused(checked);
      toast({
        title: checked ? 'Tienda pausada' : 'Tienda reactivada',
        description: checked
          ? 'No vas a recibir pedidos nuevos hasta que la reactives.'
          : 'Ya podés volver a recibir pedidos.',
      });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cambiar el estado de la tienda.' });
    } finally {
      setIsTogglingPause(false);
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

      <Card className={manuallyPaused ? 'border-destructive/40 bg-destructive/5' : ''}>
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div className="flex items-center gap-3">
            <PauseCircle className={`h-6 w-6 ${manuallyPaused ? 'text-destructive' : 'text-muted-foreground'}`} />
            <div>
              <p className="font-semibold">Pausar tienda temporalmente</p>
              <p className="text-sm text-muted-foreground">
                {manuallyPaused
                  ? 'Pausada: no te llegan pedidos nuevos aunque estés en horario de atención.'
                  : 'Si te quedaste sin stock o personal, pausá y no te van a llegar pedidos nuevos.'}
              </p>
            </div>
          </div>
          <Switch checked={manuallyPaused} onCheckedChange={handleTogglePause} disabled={isTogglingPause} />
        </CardContent>
      </Card>

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
                    ownerId={userProfile!.storeId!}
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
            
            {/* SECCIÓN DIRECCIÓN MEJORADA */}
            <div className="space-y-2">
                <Label htmlFor="address">Dirección del Local</Label>
                <div className="flex gap-2">
                    <Input 
                        id="address" 
                        name="address" 
                        value={formData.address} 
                        onChange={handleChange} 
                        // Placeholder educativo
                        placeholder="Calle, Número y Barrio (Texto visible)" 
                        className="flex-1"
                    />
                    <Button 
                        type="button" 
                        variant={coords ? "default" : "outline"} // Verde si ya tiene GPS
                        size="icon"
                        onClick={handleGetLocation}
                        disabled={isLocating}
                        title="Actualizar ubicación GPS del mapa"
                        className={coords ? "bg-success hover:bg-success/90 text-success-foreground" : ""}
                    >
                        {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> :
                         coords ? <CheckCircle2 className="h-4 w-4" /> : <LocateFixed className="h-4 w-4 text-info" />}
                    </Button>
                </div>
                
                {/* Feedback Visual Claro */}
                {coords ? (
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-success flex items-center gap-1 font-medium">
                            <MapPin className="h-3 w-3"/> Mapa configurado correctamente
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                            Lat: {coords.latitude.toFixed(4)}, Lng: {coords.longitude.toFixed(4)}
                        </span>
                    </div>
                ) : (
                    <p className="text-xs text-warning flex items-center gap-1 font-medium">
                        <AlertTriangle className="h-3 w-3"/> Importante: Presiona el botón GPS para activar el mapa.
                    </p>
                )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Rubro / Categoría de la tienda</Label>
            <Input
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                placeholder="Ej. Comida Rápida, Kiosco, Farmacia"
            />
            <p className="text-[0.8rem] text-muted-foreground">
                Con esto los clientes te filtran desde la pantalla de inicio. Usá el mismo nombre que otras tiendas del mismo rubro.
            </p>
          </div>

          {/* SECCIÓN DE HORARIOS */}
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