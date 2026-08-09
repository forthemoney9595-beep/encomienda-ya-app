'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { ImageUpload } from '@/components/image-upload';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Address {
    id: string;
    street: string;
    city: string;
    zipCode: string;
    label?: string;
    coords?: { latitude: number; longitude: number };
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
    const [tempCoords, setTempCoords] = useState<{ latitude: number; longitude: number } | undefined>(undefined);
    const [isLocating, setIsLocating] = useState(false);

    // Estados Repartidor (Solo Delivery)
    const [vehicleInfo, setVehicleInfo] = useState({ plate: '', model: '', color: '', type: 'Moto' });
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
                setVehicleInfo((userProfile as any).vehicle || { plate: '', model: '', color: '', type: 'Moto' });
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

    // Función para detectar GPS
    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            toast({ variant: "destructive", title: "Error", description: "Navegador sin soporte GPS." });
            return;
        }
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setTempCoords({ latitude, longitude });
                setIsLocating(false);
                toast({ title: "Ubicación detectada", description: "Coordenadas listas para guardar." });
            },
            (error) => {
                console.error("Error GPS:", error);
                setIsLocating(false);
                toast({ variant: "destructive", title: "Error GPS", description: "Activa tu ubicación." });
            },
            { enableHighAccuracy: true }
        );
    };

    const handleAddAddress = async () => {
        if (!userDocRef || !newAddress.street) {
            toast({ variant: "destructive", title: "Falta calle", description: "Escribe la dirección." });
            return;
        }
        
        // Objeto de dirección final
        const addressToSave: Address = {
            id: newAddress.id || Math.random().toString(36).substring(2, 9),
            street: newAddress.street.trim(),
            city: newAddress.city.trim(),
            zipCode: newAddress.zipCode.trim(),
            label: `${newAddress.street.trim()}`,
            coords: tempCoords 
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
        switch(role) {
            case 'store': return <Badge className="bg-info text-info-foreground gap-1"><Store className="h-3 w-3"/> Tienda</Badge>;
            case 'delivery': return <Badge className="bg-primary text-primary-foreground gap-1"><Bike className="h-3 w-3"/> Repartidor</Badge>;
            case 'admin': return <Badge className="bg-foreground text-background">Admin</Badge>;
            default: return <Badge variant="secondary">Cliente</Badge>;
        }
    };

    if (authLoading || !userProfile) return <div className="container p-8"><Skeleton className="h-96 w-full" /></div>;

    return (
        <div className="container mx-auto pb-20 max-w-5xl">
            <PageHeader title="Mi Perfil" description={`Gestiona tu cuenta de ${userProfile.role === 'buyer' ? 'cliente' : userProfile.role}.`} />

            <div className="grid gap-8 lg:grid-cols-12">
                {/* COLUMNA IZQUIERDA: FOTO Y DATOS BÁSICOS */}
                <Card className="lg:col-span-4 h-fit shadow-md border-t-4 border-t-primary">
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto mb-2">
                            <ImageUpload
                                currentImageUrl={profileImageUrl}
                                onImageUploaded={setProfileImageUrl}
                                folder="profiles"
                                ownerId={user!.uid}
                                variant="avatar"
                            />
                        </div>
                        {/* El badge de rol iba en absolute sobre el avatar y PISABA el botón
                            "Cambiar Foto" en celular (Fase QQ) — ahora vive junto al nombre. */}
                        <div className="flex items-center justify-center gap-2">
                            <CardTitle>{displayName || 'Usuario'}</CardTitle>
                            {getRoleBadge(userProfile.role)}
                        </div>
                        <CardDescription>{userProfile.email}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label>Nombre Visible</Label>
                            <div className="relative">
                                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="pl-9" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Teléfono / WhatsApp</Label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="pl-9" placeholder="+54 9..." />
                            </div>
                        </div>
                        <Button onClick={handleSaveProfile} className="w-full mt-4" disabled={isSavingUser}>
                            {isSavingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                            Guardar Cambios
                        </Button>
                    </CardContent>
                </Card>

                {/* COLUMNA DERECHA: PESTAÑAS SEGÚN ROL */}
                <div className="lg:col-span-8">
                    <Tabs defaultValue="info" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-6">
                            <TabsTrigger value="info">Información Detallada</TabsTrigger>
                            {userProfile.role === 'buyer' && <TabsTrigger value="addresses">Mis Direcciones</TabsTrigger>}
                            {userProfile.role === 'store' && <TabsTrigger value="store">Mi Tienda</TabsTrigger>}
                            {userProfile.role === 'delivery' && <TabsTrigger value="vehicle">Vehículo y Licencia</TabsTrigger>}
                        </TabsList>

                        <TabsContent value="info">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Detalles de la Cuenta</CardTitle>
                                    <CardDescription>Información técnica de tu usuario.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">ID de Usuario</Label>
                                            <div className="font-mono text-sm bg-muted p-2 rounded">{user.uid}</div>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Fecha de Registro</Label>
                                            <div className="text-sm bg-muted p-2 rounded">
                                                {user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : '-'}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* --- SOLO PARA CLIENTES --- */}
                        {userProfile.role === 'buyer' && (
                            <TabsContent value="addresses">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle>Mis Direcciones</CardTitle>
                                            <CardDescription>Lugares frecuentes de entrega.</CardDescription>
                                        </div>
                                        <Button size="sm" onClick={() => {
                                            setNewAddress({ id: '', street: '', city: '', zipCode: '', isEditing: false });
                                            setTempCoords(undefined);
                                            setIsAddingAddress(true);
                                        }} disabled={isAddingAddress}>
                                            <Plus className="h-4 w-4 mr-2" /> Nueva
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {isAddingAddress && (
                                            <div className="bg-muted/30 p-4 rounded-lg border border-primary/20 space-y-3 animate-in fade-in zoom-in-95">
                                                <h4 className="font-semibold text-sm">{newAddress.isEditing ? 'Editar' : 'Nueva'} Dirección</h4>
                                                
                                                {/* CAMPO DE DIRECCIÓN */}
                                                <div className="space-y-2">
                                                    <Label>Dirección Exacta</Label>
                                                    <Input name="street" placeholder="Ej: Calle San Martín 500 (Casa blanca)" value={newAddress.street} onChange={handleAddressChange} />
                                                </div>

                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <Input name="city" placeholder="Ciudad / Barrio" value={newAddress.city} onChange={handleAddressChange} />
                                                    <Input name="zipCode" placeholder="C.P." value={newAddress.zipCode} onChange={handleAddressChange} />
                                                </div>

                                                {/* BOTÓN GPS */}
                                                <div className="flex items-center justify-between bg-muted p-2 rounded border">
                                                    <span className="text-sm text-muted-foreground ml-2">
                                                        {tempCoords ? "✅ GPS detectado" : "📍 Ubicación exacta (Recomendado)"}
                                                    </span>
                                                    <Button 
                                                        type="button" 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={handleGetLocation} 
                                                        disabled={isLocating}
                                                        className={tempCoords ? "text-success border-success/30 bg-success/10" : ""}
                                                    >
                                                        {isLocating ? <Loader2 className="h-4 w-4 animate-spin"/> : 
                                                         tempCoords ? <CheckCircle2 className="h-4 w-4"/> : <LocateFixed className="h-4 w-4"/>}
                                                        {tempCoords ? "Actualizar" : "Detectar"}
                                                    </Button>
                                                </div>

                                                <div className="flex justify-end gap-2 pt-2">
                                                    <Button variant="ghost" size="sm" onClick={() => setIsAddingAddress(false)}>Cancelar</Button>
                                                    <Button size="sm" onClick={handleAddAddress}>Guardar</Button>
                                                </div>
                                            </div>
                                        )}

                                        {addresses.length === 0 && !isAddingAddress ? (
                                            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                                                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                No tienes direcciones guardadas.
                                            </div>
                                        ) : (
                                            addresses.map(addr => (
                                                <div key={addr.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-full ${addr.coords ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                                                            <MapPin className="h-4 w-4"/>
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-sm">{addr.street}</p>
                                                            <p className="text-xs text-muted-foreground">{addr.city} {addr.coords && '• GPS Activo'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteAddress(addr)}><Trash2 className="h-4 w-4"/></Button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        )}

                        {/* --- SOLO PARA TIENDAS --- */}
                        {userProfile.role === 'store' && (
                            <TabsContent value="store">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Store className="h-5 w-5" /> Configuración de tu tienda
                                        </CardTitle>
                                        <CardDescription>
                                            Horario, descripción, banner, rubro y dirección se gestionan desde el panel de tu tienda, no desde tu perfil personal.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Link href="/my-store/edit">
                                            <Button className="w-full">
                                                Ir a editar mi tienda <ArrowRight className="ml-2 h-4 w-4" />
                                            </Button>
                                        </Link>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        )}

                        {/* --- SOLO PARA REPARTIDORES --- */}
                        {userProfile.role === 'delivery' && (
                            <TabsContent value="vehicle">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Vehículo y Documentación</CardTitle>
                                        <CardDescription>Mantén tus datos al día para poder recibir pedidos.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Tipo de Vehículo</Label>
                                                <Select value={vehicleInfo.type} onValueChange={(val) => setVehicleInfo({...vehicleInfo, type: val})}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecciona" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Moto">Moto</SelectItem>
                                                        <SelectItem value="Bici">Bicicleta</SelectItem>
                                                        <SelectItem value="Auto">Auto</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Patente / Placa</Label>
                                                <div className="relative">
                                                    <Car className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                    <Input placeholder="Ej: A123BCD" value={vehicleInfo.plate} onChange={(e) => setVehicleInfo({...vehicleInfo, plate: e.target.value})} className="pl-9 uppercase" />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Modelo</Label>
                                                <Input placeholder="Ej: Honda Wave 110" value={vehicleInfo.model} onChange={(e) => setVehicleInfo({...vehicleInfo, model: e.target.value})} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Color</Label>
                                                <Input placeholder="Ej: Roja" value={vehicleInfo.color} onChange={(e) => setVehicleInfo({...vehicleInfo, color: e.target.value})} />
                                            </div>
                                        </div>

                                        <div className="space-y-3 pt-4 border-t">
                                            <Label className="flex items-center gap-2">
                                                <FileText className="h-4 w-4" /> Verificación de Licencia de Conducir
                                            </Label>
                                            <p className="text-xs text-muted-foreground -mt-1">
                                                Subí las fotos de tus documentos para agilizar tu aprobación. Deben ser claras y legibles.
                                            </p>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                {([
                                                    { label: 'Frente del carnet', field: 'licenseUrl', value: licenseUrl, set: setLicenseUrl },
                                                    { label: 'Dorso del carnet', field: 'licenseBackUrl', value: licenseBackUrl, set: setLicenseBackUrl },
                                                    { label: 'Selfie con el carnet', field: 'licenseSelfieUrl', value: licenseSelfieUrl, set: setLicenseSelfieUrl },
                                                    { label: 'Cédula / papeles del vehículo', field: 'vehicleDocUrl', value: vehicleDocUrl, set: setVehicleDocUrl },
                                                    { label: 'Seguro del vehículo vigente', field: 'vehicleInsuranceUrl', value: vehicleInsuranceUrl, set: setVehicleInsuranceUrl },
                                                ] as const).map(({ label, field, value, set }) => {
                                                    // Compat con datos viejos (URL completa con token ya guardada); lo nuevo es
                                                    // un path que se resuelve a una URL firmada de 5 min vía el useEffect de arriba.
                                                    const isLegacyUrl = value.startsWith('http');
                                                    const displayUrl = isLegacyUrl ? value : licenseDisplayUrls[field];
                                                    return (
                                                    <div key={label} className="space-y-1.5">
                                                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                                                        <div className="border-2 border-dashed rounded-lg p-3 flex flex-col items-center justify-center bg-muted/20 min-h-[140px]">
                                                            {value ? (
                                                                <div className="relative w-full h-32">
                                                                    {displayUrl ? (
                                                                        <img src={displayUrl} alt={label} className="w-full h-full object-contain rounded-md" />
                                                                    ) : (
                                                                        <div className="flex h-full w-full items-center justify-center text-center text-xs text-muted-foreground px-2">
                                                                            {loadingLicenseUrls ? 'Cargando...' : '✅ Imagen cargada (se verá al guardar)'}
                                                                        </div>
                                                                    )}
                                                                    <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => set('')}>
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                            ) : (
                                                                <ImageUpload
                                                                    onImageUploaded={set}
                                                                    folder="licenses"
                                                                    ownerId={user!.uid}
                                                                    storeRawPath
                                                                    variant="banner"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                                💡 La selfie sirve para confirmar que el carnet es tuyo. Sostené el carnet junto a tu cara.
                                            </p>
                                        </div>

                                        <Button className="w-full" onClick={handleSaveProfile}>
                                            Guardar Datos del Vehículo
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