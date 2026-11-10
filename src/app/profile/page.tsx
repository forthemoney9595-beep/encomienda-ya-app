'use client';

import { useState, useEffect, useMemo } from 'react';
import { VEHICLE_TYPES, DOC_FIELDS, normalizeVehicleType, isBikeType } from '@/lib/driver-docs';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { SoundPicker } from '@/components/sound-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth'; 
// ✅ CORREGIDO: Agregamos 'Save' y 'Clock' que faltaban
import { User, Phone, Trash2, Loader2, Store, Bike, FileText, Car, Plus, MapPin, LocateFixed, CheckCircle2, Save, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { largeFields } from '@/components/auth-screen';
import { Garland } from '@/components/garland';
import { ImageUpload } from '@/components/image-upload';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { capturePosition, type GeoCoords } from '@/lib/geo';
import { LocationPicker } from '@/components/location-picker';

interface Address {
    id: string;
    street: string;
    city: string;
    zipCode: string;
    label?: string;
    coords?: GeoCoords;
}

export default function ProfilePage() {
    const { user, userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    
    // Estados Generales
    const [isSavingUser, setIsSavingUser] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState(''); 
    const [profileImageUrl, setProfileImageUrl] = useState('');

    // Estados Direcciones (Solo Clientes)
    const [isAddingAddress, setIsAddingAddress] = useState(false);
    const [addresses, setAddresses] = useState<Address[]>([]);
    
    // Estado de dirección temporal con GPS
    const [newAddress, setNewAddress] = useState<Omit<Address, 'id'> & { isEditing: boolean, id: string }>({ 
        id: '', street: '', city: '', zipCode: '', isEditing: false 
    });
    const [tempCoords, setTempCoords] = useState<GeoCoords | undefined>(undefined);
    const [isLocating, setIsLocating] = useState(false);

    // Estados Repartidor (Solo Delivery)
    const [vehicleInfo, setVehicleInfo] = useState({ plate: '', model: '', color: '', type: 'motocicleta' as string });
    const [licenseUrl, setLicenseUrl] = useState('');          // frente del carnet (compat con el campo viejo)
    const [licenseBackUrl, setLicenseBackUrl] = useState('');   // dorso del carnet
    const [licenseSelfieUrl, setLicenseSelfieUrl] = useState(''); // selfie sosteniendo el carnet
    const [vehicleDocUrl, setVehicleDocUrl] = useState('');       // cédula/papeles del vehículo (Fase PP)
    const [vehicleInsuranceUrl, setVehicleInsuranceUrl] = useState(''); // seguro del vehículo (Fase PP)
    // URLs YA GUARDADAS se muestran vía una URL firmada de 5 min (/api/licenses/signed-url),
    // nunca directo -- ver Fase BB: guardar un link público con token permanente para un DNI
    // es el propio hallazgo de seguridad que esto corrige. Si el campo recién se subió y
    // todavía no se guardó, no hay nada que resolver (ver "justUploaded" en el render).
    const [licenseDisplayUrls, setLicenseDisplayUrls] = useState<Record<string, string | null>>({});
    const [loadingLicenseUrls, setLoadingLicenseUrls] = useState(false);

    const userDocRef = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user?.uid]);

    // Cargar Datos
    useEffect(() => {
        if (userProfile) {
            setDisplayName(userProfile.name || userProfile.displayName || '');
            setPhoneNumber(userProfile.phoneNumber || ''); 
            
            const photo = (userProfile as any).photoURL || userProfile.profileImageUrl || '';
            setProfileImageUrl(photo);
            
            if (userProfile.role === 'buyer') {
                setAddresses(userProfile.addresses as Address[] || []);
            }
            if (userProfile.role === 'delivery') {
                {
                    // FE-R-003: el alta guarda 'motocicleta'|'automovil'|'bicicleta' y el Perfil ofrecía
                    // 'Moto'|'Bici'|'Auto' → Select vacío y, al guardar, se pisaba el tipo. Se normaliza.
                    const v = (userProfile as any).vehicle || {};
                    setVehicleInfo({ plate: v.plate || '', model: v.model || '', color: v.color || '', type: normalizeVehicleType(v.type) });
                }
                setLicenseUrl((userProfile as any).licenseUrl || '');
                setLicenseBackUrl((userProfile as any).licenseBackUrl || '');
                setLicenseSelfieUrl((userProfile as any).licenseSelfieUrl || '');
                setVehicleDocUrl((userProfile as any).vehicleDocUrl || '');
                setVehicleInsuranceUrl((userProfile as any).vehicleInsuranceUrl || '');
            }
        }
    }, [userProfile]);

    // Resuelve las 3 fotos de licencia YA GUARDADAS a URLs firmadas de corta duración, para
    // poder mostrarlas en esta misma pantalla sin guardar un link permanente en ningún lado.
    useEffect(() => {
        if (!user || userProfile?.role !== 'delivery') return;
        const hasAny = (userProfile as any).licenseUrl || (userProfile as any).licenseBackUrl || (userProfile as any).licenseSelfieUrl;
        if (!hasAny) return;

        let cancelled = false;
        setLoadingLicenseUrls(true);
        user.getIdToken()
            .then(token => fetch('/api/licenses/signed-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ uid: user.uid }),
            }))
            .then(res => res.json())
            .then(data => { if (!cancelled) setLicenseDisplayUrls(data); })
            .catch(err => console.error('Error resolviendo fotos de licencia:', err))
            .finally(() => { if (!cancelled) setLoadingLicenseUrls(false); });

        return () => { cancelled = true; };
    }, [user, userProfile]);

    useEffect(() => {
        if (!authLoading && !user) router.push('/login');
    }, [authLoading, user, router]);

    // Foto de perfil: se GUARDA SOLA al subirla (Fase RR sexies). Antes la subida solo
    // actualizaba el estado local y el toast decía "actualizada" — pero sin tocar
    // "Guardar Cambios" el perfil quedaba con la foto vieja (falla real de la prueba:
    // "cambio la foto y me sigue figurando la más antigua").
    const handlePhotoUploaded = async (url: string) => {
        setProfileImageUrl(url);
        if (!userDocRef || !user) return;
        try {
            await updateDoc(userDocRef, { photoURL: url, profileImageUrl: url });
            await updateProfile(user, { photoURL: url });
        } catch (e) {
            console.error('Error guardando la foto de perfil:', e);
            toast({ variant: 'destructive', title: 'La foto se subió pero no se pudo guardar', description: 'Tocá "Guardar Cambios" para reintentar.' });
        }
    };

    // --- GUARDADO GENERAL ---
    const handleSaveProfile = async () => {
        if (!userDocRef || !user) return;
        setIsSavingUser(true);
        try {
            const newName = displayName.trim();
            const baseData = {
                name: newName,
                displayName: newName,
                photoURL: profileImageUrl,
                profileImageUrl: profileImageUrl, 
                phoneNumber: phoneNumber.trim(),
            };

            let extraData = {};
            if (userProfile?.role === 'delivery') {
                extraData = { vehicle: vehicleInfo, licenseUrl, licenseBackUrl, licenseSelfieUrl, vehicleDocUrl, vehicleInsuranceUrl };
            }

            await updateDoc(userDocRef, { ...baseData, ...extraData });
            await updateProfile(user, { displayName: newName, photoURL: profileImageUrl });

            toast({ title: '¡Perfil Actualizado!', description: 'Tus datos se guardaron correctamente.' });
            router.refresh();
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar.' });
        } finally {
            setIsSavingUser(false);
        }
    };

    // --- DIRECCIONES (Solo Clientes) ---
    const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setNewAddress(prev => ({ ...prev, [name]: value }));
    };

    // Detectar GPS (Fase RR: captura compartida de geo.ts — timeout, mensajes por tipo
    // de error, y guarda la precisión para que el pin del mapa la muestre).
    const handleGetLocation = async () => {
        setIsLocating(true);
        try {
            const coords = await capturePosition();
            setTempCoords(coords);
            toast({ title: "Ubicación detectada", description: "Verificá el pin en el mapa y ajustalo si hace falta." });
        } catch (error: any) {
            console.error("Error GPS:", error);
            toast({ variant: "destructive", title: "Error GPS", description: error.message });
        } finally {
            setIsLocating(false);
        }
    };

    const handleAddAddress = async () => {
        if (!userDocRef || !newAddress.street) {
            toast({ variant: "destructive", title: "Falta calle", description: "Escribe la dirección." });
            return;
        }
        
        // Objeto de dirección final. `coords` solo si existe: el SDK de Firestore
        // rechaza claves con valor `undefined` dentro de arrayUnion.
        const addressToSave: Address = {
            id: newAddress.id || Math.random().toString(36).substring(2, 9),
            street: newAddress.street.trim(),
            city: newAddress.city.trim(),
            zipCode: newAddress.zipCode.trim(),
            label: `${newAddress.street.trim()}`,
            ...(tempCoords ? { coords: tempCoords } : {}),
        };
        
        try {
            // Si editamos, borramos la vieja primero
            if (newAddress.isEditing) {
                const oldAddress = addresses.find(a => a.id === newAddress.id);
                if (oldAddress) await updateDoc(userDocRef, { addresses: arrayRemove(oldAddress) });
            }
            
            // Guardamos la nueva
            await updateDoc(userDocRef, { addresses: arrayUnion(addressToSave) });
            
            toast({ title: 'Dirección Guardada', description: tempCoords ? 'Incluye ubicación GPS precisa.' : 'Dirección de texto guardada.' });
            
            // Reset
            setNewAddress({ id: '', street: '', city: '', zipCode: '', isEditing: false });
            setTempCoords(undefined);
            setIsAddingAddress(false);
        } catch(e) { 
            toast({ variant: 'destructive', title: 'Error al guardar' }); 
        }
    };

    const handleDeleteAddress = async (address: Address) => {
        if (!userDocRef || !confirm('¿Borrar dirección?')) return;
        try {
            await updateDoc(userDocRef, { addresses: arrayRemove(address) });
            toast({ title: 'Dirección Eliminada' });
        } catch (e) { toast({ variant: 'destructive', title: 'Error' }); }
    };

    const getRoleBadge = (role?: string) => {
        // Píldoras con texto sobre relleno sólido del token (contraste AA en los dos temas).
        const base = 'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-sm font-semibold';
        switch(role) {
            case 'store': return <span className={cn(base, 'bg-info text-info-foreground')}><Store className="h-4 w-4" aria-hidden="true"/> Tienda</span>;
            case 'delivery': return <span className={cn(base, 'bg-primary text-primary-foreground')}><Bike className="h-4 w-4" aria-hidden="true"/> Repartidor</span>;
            case 'admin': return <span className={cn(base, 'bg-foreground text-background')}>Admin</span>;
            default: return <span className={cn(base, 'bg-foreground/10 text-foreground')}><User className="h-4 w-4" aria-hidden="true"/> Cliente</span>;
        }
    };

    if (authLoading || !userProfile) return <div className="container p-8"><Skeleton className="h-96 w-full rounded-card" /></div>;

    const secondTab =
        userProfile.role === 'buyer' ? 'addresses'
        : userProfile.role === 'store' ? 'store'
        : userProfile.role === 'delivery' ? 'vehicle'
        : null;
    const sectionTitle = 'font-headline text-2xl font-bold leading-tight';
    const tabTrigger = 'min-h-11 flex-1 rounded-xl px-4 text-base font-semibold transition-colors duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm';
    const pillButton = 'h-12 w-full rounded-2xl text-base font-bold';

    return (
        <div className={cn('container mx-auto max-w-5xl pb-20', largeFields)}>
            <PageHeader title="Mi Perfil" description={`Gestioná tu cuenta de ${
                ({ buyer: 'cliente', store: 'tienda', delivery: 'repartidor', admin: 'administrador' } as Record<string, string>)[userProfile.role] || 'usuario'
            }.`} />

            <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
                {/* COLUMNA IZQUIERDA: FOTO Y DATOS BÁSICOS */}
                <Card className="relative h-fit lg:col-span-4" data-testid="profile-card">
                    <Garland />
                    <CardHeader className="items-center pb-2 text-center">
                        <div className="mx-auto mb-3">
                            <ImageUpload
                                currentImageUrl={profileImageUrl}
                                onImageUploaded={handlePhotoUploaded}
                                folder="profiles"
                                ownerId={user!.uid}
                                variant="avatar"
                                label="foto de perfil"
                            />
                        </div>
                        {/* El badge de rol iba en absolute sobre el avatar y PISABA el botón
                            "Cambiar Foto" en celular (Fase QQ) — ahora vive junto al nombre. */}
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <CardTitle className="font-headline text-2xl">{displayName || 'Usuario'}</CardTitle>
                            {getRoleBadge(userProfile.role)}
                        </div>
                        <CardDescription className="break-all text-base">{userProfile.email}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="profile-name">Nombre visible</Label>
                            <div className="relative">
                                <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                <Input id="profile-name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="!pl-12" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="profile-phone">Teléfono / WhatsApp</Label>
                            <div className="relative">
                                <Phone className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                <Input id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="!pl-12" placeholder="+54 9..." />
                            </div>
                        </div>
                        <Button onClick={handleSaveProfile} className={cn(pillButton, 'mt-2')} disabled={isSavingUser}>
                            {isSavingUser ? <Loader2 className="h-5 w-5 animate-spin"/> : <Save className="h-5 w-5"/>}
                            Guardar cambios
                        </Button>
                    </CardContent>
                </Card>

                {/* COLUMNA DERECHA: PESTAÑAS SEGÚN ROL */}
                <div className="min-w-0 lg:col-span-8">
                    <Tabs defaultValue="info" className="w-full">
                        {secondTab && (
                            <TabsList className="glass mb-5 flex h-auto w-full gap-1 rounded-2xl p-1">
                                <TabsTrigger value="info" className={tabTrigger}>Mi cuenta</TabsTrigger>
                                {userProfile.role === 'buyer' && <TabsTrigger value="addresses" className={tabTrigger}>Mis direcciones</TabsTrigger>}
                                {userProfile.role === 'store' && <TabsTrigger value="store" className={tabTrigger}>Mi tienda</TabsTrigger>}
                                {userProfile.role === 'delivery' && <TabsTrigger value="vehicle" className={tabTrigger}>Vehículo y documentos</TabsTrigger>}
                            </TabsList>
                        )}

                        <TabsContent value="info" className="mt-0 space-y-5">
                            {/* Apariencia: tema claro (default desde el Rediseño 2) u oscuro, y
                                el sonido de los avisos (9/11/2026). Ambos por dispositivo. */}
                            <Card data-testid="profile-appearance">
                                <CardHeader>
                                    <CardTitle className={sectionTitle}>Apariencia</CardTitle>
                                    <CardDescription className="text-base">Elegí cómo se ve y cómo suena la app en este dispositivo.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div>
                                        <p className="mb-2 text-base font-semibold">Tema</p>
                                        <ThemeToggle />
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            El modo claro se lee más cómodo con mucha luz o con la vista cansada.
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-base font-semibold">Sonido de los avisos</p>
                                        <p className="mb-3 text-sm text-muted-foreground">
                                            Suena con la app abierta: pedido nuevo, mensajes del chat y cambios de estado. Tocá uno para escucharlo.
                                        </p>
                                        <SoundPicker />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle className={sectionTitle}>Tu cuenta</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {/* 🔒 El uid completo ("ID de Usuario") se ELIMINÓ de acá
                                        (auditoría de privacidad ago 2026): era ruido técnico sin
                                        uso para la persona — el soporte encuentra cuentas por
                                        email, nunca por uid. */}
                                    <dl className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-2xl bg-foreground/5 px-4 py-3">
                                            <dt className="text-sm text-muted-foreground">Te registraste el</dt>
                                            <dd className="text-base font-semibold">
                                                {user?.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
                                            </dd>
                                        </div>
                                        <div className="rounded-2xl bg-foreground/5 px-4 py-3">
                                            <dt className="text-sm text-muted-foreground">Correo</dt>
                                            <dd className="break-all text-base font-semibold">{userProfile.email}</dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* --- SOLO PARA CLIENTES --- */}
                        {userProfile.role === 'buyer' && (
                            <TabsContent value="addresses" className="mt-0">
                                <Card>
                                    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                                        <div className="min-w-0">
                                            <CardTitle className={sectionTitle}>Mis direcciones</CardTitle>
                                            <CardDescription className="text-base">Los lugares donde recibís tus pedidos.</CardDescription>
                                        </div>
                                        <Button className="h-11 shrink-0 rounded-2xl px-4 text-base font-semibold" onClick={() => {
                                            setNewAddress({ id: '', street: '', city: '', zipCode: '', isEditing: false });
                                            setTempCoords(undefined);
                                            setIsAddingAddress(true);
                                        }} disabled={isAddingAddress}>
                                            <Plus className="h-5 w-5" /> Nueva
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {isAddingAddress && (
                                            <div className="space-y-4 rounded-2xl border border-primary/25 bg-background/50 p-4 animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none">
                                                <h3 className="font-headline text-xl font-bold">{newAddress.isEditing ? 'Editar' : 'Nueva'} dirección</h3>

                                                {/* CAMPO DE DIRECCIÓN */}
                                                <div className="space-y-2">
                                                    <Label htmlFor="addr-street">Dirección exacta</Label>
                                                    <Input id="addr-street" name="street" autoComplete="street-address" placeholder="Ej: Calle San Martín 500 (casa blanca)" value={newAddress.street} onChange={handleAddressChange} />
                                                </div>

                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="addr-city">Ciudad o barrio</Label>
                                                        <Input id="addr-city" name="city" placeholder="Ej: Tinogasta" value={newAddress.city} onChange={handleAddressChange} />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="addr-zip">Código postal</Label>
                                                        <Input id="addr-zip" name="zipCode" inputMode="numeric" autoComplete="postal-code" placeholder="Ej: 5340" value={newAddress.zipCode} onChange={handleAddressChange} />
                                                    </div>
                                                </div>

                                                {/* BOTÓN GPS */}
                                                <div className="flex items-center justify-between gap-3 rounded-2xl bg-foreground/5 p-2 pl-4">
                                                    <span className="text-sm text-muted-foreground">
                                                        {tempCoords ? "Ubicación marcada" : "Ubicación exacta (recomendado)"}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={handleGetLocation}
                                                        disabled={isLocating}
                                                        className={cn('h-11 shrink-0 rounded-xl bg-background/70 px-4 font-semibold', tempCoords && 'border-success/40 bg-success/10 text-success hover:text-success')}
                                                    >
                                                        {isLocating ? <Loader2 className="h-5 w-5 animate-spin"/> :
                                                         tempCoords ? <CheckCircle2 className="h-5 w-5"/> : <LocateFixed className="h-5 w-5"/>}
                                                        {tempCoords ? "Actualizar" : "Detectar"}
                                                    </Button>
                                                </div>

                                                {/* PIN AJUSTABLE (Fase RR): el GPS crudo puede errarle por cuadras.
                                                    El mapa deja verificar/corregir el punto arrastrando el pin, o
                                                    marcarlo a mano si el GPS está apagado/denegado. */}
                                                <div className="overflow-hidden rounded-2xl">
                                                    <LocationPicker
                                                        value={tempCoords ?? null}
                                                        onChange={(c) => setTempCoords(c)}
                                                        className="h-48"
                                                        hint={tempCoords
                                                            ? 'Arrastrá el pin hasta la entrada exacta de tu casa.'
                                                            : 'Tocá el mapa donde está tu casa para colocar el pin (o usá "Detectar").'}
                                                    />
                                                </div>

                                                <div className="flex justify-end gap-2 pt-1">
                                                    <Button variant="ghost" className="h-11 rounded-xl px-4 text-base" onClick={() => setIsAddingAddress(false)}>Cancelar</Button>
                                                    <Button className="h-11 rounded-xl px-5 text-base font-semibold" onClick={handleAddAddress}>Guardar</Button>
                                                </div>
                                            </div>
                                        )}

                                        {addresses.length === 0 && !isAddingAddress ? (
                                            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-foreground/15 px-4 py-10 text-center text-muted-foreground">
                                                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/5">
                                                    <MapPin className="h-7 w-7" aria-hidden="true" />
                                                </span>
                                                Todavía no guardaste ninguna dirección.
                                            </div>
                                        ) : (
                                            <ul className="space-y-2">
                                            {addresses.map(addr => (
                                                <li key={addr.id} className="flex items-center justify-between gap-3 rounded-2xl bg-background/50 p-3 transition-colors hover:bg-foreground/5">
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', addr.coords ? 'bg-success text-success-foreground' : 'bg-foreground/10 text-muted-foreground')}>
                                                            <MapPin className="h-5 w-5" aria-hidden="true"/>
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className="truncate text-base font-semibold">{addr.street}</p>
                                                            <p className="text-sm text-muted-foreground">{[addr.city, addr.coords && 'Con ubicación en el mapa'].filter(Boolean).join(' · ')}</p>
                                                        </div>
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteAddress(addr)} aria-label={`Borrar la dirección ${addr.street}`}>
                                                        <Trash2 className="h-5 w-5"/>
                                                    </Button>
                                                </li>
                                            ))}
                                            </ul>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        )}

                        {/* --- SOLO PARA TIENDAS --- */}
                        {userProfile.role === 'store' && (
                            <TabsContent value="store" className="mt-0">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className={cn(sectionTitle, 'flex items-center gap-2')}>
                                            <Store className="h-6 w-6 text-primary" aria-hidden="true" /> Configuración de tu tienda
                                        </CardTitle>
                                        <CardDescription className="text-base">
                                            Horario, descripción, banner, rubro y dirección se manejan desde el panel de tu tienda, no desde tu perfil personal.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Button asChild className={pillButton}>
                                            <Link href="/my-store/edit">
                                                Ir a editar mi tienda <ArrowRight className="h-5 w-5" />
                                            </Link>
                                        </Button>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        )}

                        {/* --- SOLO PARA REPARTIDORES --- */}
                        {userProfile.role === 'delivery' && (
                            <TabsContent value="vehicle" className="mt-0 space-y-5">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className={sectionTitle}>Tu vehículo</CardTitle>
                                        <CardDescription className="text-base">Mantené tus datos al día para poder recibir pedidos.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="vehicle-type">Tipo de vehículo</Label>
                                                <Select value={vehicleInfo.type} onValueChange={(val) => setVehicleInfo({...vehicleInfo, type: val})}>
                                                    <SelectTrigger id="vehicle-type">
                                                        <SelectValue placeholder="Elegí uno" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {VEHICLE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {!isBikeType(vehicleInfo.type) && (
                                            <div className="space-y-2">
                                                <Label htmlFor="vehicle-plate">Patente</Label>
                                                <div className="relative">
                                                    <Car className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                                    <Input id="vehicle-plate" autoCapitalize="characters" placeholder="Ej: A123BCD" value={vehicleInfo.plate} onChange={(e) => setVehicleInfo({...vehicleInfo, plate: e.target.value})} className="!pl-12 uppercase" />
                                                </div>
                                            </div>
                                            )}
                                            <div className="space-y-2">
                                                <Label htmlFor="vehicle-model">Modelo</Label>
                                                <Input id="vehicle-model" placeholder="Ej: Honda Wave 110" value={vehicleInfo.model} onChange={(e) => setVehicleInfo({...vehicleInfo, model: e.target.value})} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="vehicle-color">Color</Label>
                                                <Input id="vehicle-color" placeholder="Ej: Roja" value={vehicleInfo.color} onChange={(e) => setVehicleInfo({...vehicleInfo, color: e.target.value})} />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card data-testid="profile-docs">
                                    <CardHeader>
                                        <CardTitle className={cn(sectionTitle, 'flex items-center gap-2')}>
                                            <FileText className="h-6 w-6 text-primary" aria-hidden="true" /> {isBikeType(vehicleInfo.type) ? 'Tu identidad (DNI)' : 'Licencia y papeles del vehículo'}
                                        </CardTitle>
                                        <CardDescription className="text-base">
                                            Subí las fotos de tus documentos para agilizar tu aprobación. Tienen que verse claras y legibles. Solo las ve el equipo de aprobación.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                {DOC_FIELDS(isBikeType(vehicleInfo.type)).map(({ key: field, label }) => {
                                                    // Mismos documentos que pide el alta (src/lib/driver-docs.ts): bici = DNI ×3,
                                                    // moto/auto = licencia ×3 + cédula + seguro.
                                                    const docState = {
                                                        licenseUrl: [licenseUrl, setLicenseUrl],
                                                        licenseBackUrl: [licenseBackUrl, setLicenseBackUrl],
                                                        licenseSelfieUrl: [licenseSelfieUrl, setLicenseSelfieUrl],
                                                        vehicleDocUrl: [vehicleDocUrl, setVehicleDocUrl],
                                                        vehicleInsuranceUrl: [vehicleInsuranceUrl, setVehicleInsuranceUrl],
                                                    } as const;
                                                    const [value, set] = docState[field] as unknown as [string, (v: string) => void];
                                                    // Compat con datos viejos (URL completa con token ya guardada); lo nuevo es
                                                    // un path que se resuelve a una URL firmada de 5 min vía el useEffect de arriba.
                                                    const isLegacyUrl = value.startsWith('http');
                                                    const displayUrl = isLegacyUrl ? value : licenseDisplayUrls[field];
                                                    return (
                                                    <div key={label} className="space-y-2">
                                                        <p className="flex items-center gap-1.5 text-[0.95rem] font-semibold">
                                                            {value
                                                                ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                                                                : <span className="h-5 w-5 rounded-full border-2 border-foreground/20" aria-hidden="true" />}
                                                            {label}
                                                            {value && <span className="sr-only">(cargada)</span>}
                                                        </p>
                                                        {value ? (
                                                            <div className="relative h-48 overflow-hidden rounded-2xl border border-foreground/10 bg-background/50">
                                                                {displayUrl ? (
                                                                    <img src={displayUrl} alt={label} className="h-full w-full object-contain" />
                                                                ) : (
                                                                    <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                                                                        {loadingLicenseUrls ? 'Cargando…' : 'Imagen cargada (se verá al guardar)'}
                                                                    </div>
                                                                )}
                                                                <Button variant="destructive" size="icon" className="absolute right-2 top-2 h-10 w-10 rounded-full shadow-md" onClick={() => set('')} aria-label={`Quitar ${label}`}>
                                                                    <Trash2 className="h-5 w-5" />
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <ImageUpload
                                                                onImageUploaded={set}
                                                                folder="licenses"
                                                                ownerId={user!.uid}
                                                                storeRawPath
                                                                variant="banner"
                                                                label={label}
                                                            />
                                                        )}
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                La selfie sirve para confirmar que el documento es tuyo. Sostenelo junto a tu cara.
                                            </p>

                                        <Button className={pillButton} onClick={handleSaveProfile}>
                                            Guardar datos del vehículo
                                        </Button>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        )}
                    </Tabs>
                </div>
            </div>
        </div>
    );
}
