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
import { doc, updateDoc, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth'; 
import { User, Mail, MapPin, Save, Plus, X, Phone, Trash2, Pencil, Loader2, Store, Bike, Clock, FileText, Car, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { ImageUpload } from '@/components/image-upload';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Address {
    id: string;
    street: string;
    city: string;
    zipCode: string;
    label?: string;
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
    const [newAddress, setNewAddress] = useState<Omit<Address, 'id'> & { isEditing: boolean, id: string }>({ 
        id: '', street: '', city: '', zipCode: '', isEditing: false 
    });

    // Estados Tienda (Solo Stores)
    const [storeSchedule, setStoreSchedule] = useState({ open: "09:00", close: "22:00" });
    const [storeDescription, setStoreDescription] = useState('');

    // Estados Repartidor (Solo Delivery)
    const [vehicleInfo, setVehicleInfo] = useState({ plate: '', model: '', color: '', type: 'Moto' });
    const [licenseUrl, setLicenseUrl] = useState('');

    const userDocRef = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user?.uid]);

    // Cargar Datos
    useEffect(() => {
        if (userProfile) {
            setDisplayName(userProfile.name || userProfile.displayName || '');
            setPhoneNumber(userProfile.phoneNumber || ''); 
            
            // 🛠️ CORRECCIÓN 1: Usamos 'as any' para evitar el error de photoURL si no está en la interfaz
            const photo = (userProfile as any).photoURL || userProfile.profileImageUrl || '';
            setProfileImageUrl(photo);
            
            // Cargar datos específicos según rol
            if (userProfile.role === 'buyer') {
                setAddresses(userProfile.addresses as Address[] || []);
            }
            if (userProfile.role === 'store') {
                setStoreSchedule((userProfile as any).schedule || { open: "09:00", close: "22:00" });
                setStoreDescription((userProfile as any).description || '');
            }
            if (userProfile.role === 'delivery') {
                setVehicleInfo((userProfile as any).vehicle || { plate: '', model: '', color: '', type: 'Moto' });
                setLicenseUrl((userProfile as any).licenseUrl || '');
            }
        }
    }, [userProfile]);

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
                profileImageUrl: profileImageUrl, // Compatibilidad
                phoneNumber: phoneNumber.trim(),
            };

            // Datos Extra según Rol
            let extraData = {};
            if (userProfile?.role === 'store') {
                extraData = { schedule: storeSchedule, description: storeDescription };
            } else if (userProfile?.role === 'delivery') {
                extraData = { vehicle: vehicleInfo, licenseUrl: licenseUrl };
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

    const handleAddAddress = async () => {
        if (!userDocRef || !newAddress.street) return;
        const addressToSave = {
            id: newAddress.id || Math.random().toString(36).substring(2, 9),
            street: newAddress.street.trim(),
            city: newAddress.city.trim(),
            zipCode: newAddress.zipCode.trim(),
            label: `${newAddress.street.trim()}`,
        };
        
        try {
            if (newAddress.isEditing) {
                const oldAddress = addresses.find(a => a.id === newAddress.id);
                if (oldAddress) await updateDoc(userDocRef, { addresses: arrayRemove(oldAddress) });
            }
            await updateDoc(userDocRef, { addresses: arrayUnion(addressToSave) });
            toast({ title: 'Dirección Guardada' });
            setNewAddress({ id: '', street: '', city: '', zipCode: '', isEditing: false });
            setIsAddingAddress(false);
        } catch(e) { toast({ variant: 'destructive', title: 'Error' }); }
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
            case 'store': return <Badge className="bg-blue-600 gap-1"><Store className="h-3 w-3"/> Tienda</Badge>;
            case 'delivery': return <Badge className="bg-orange-600 gap-1"><Bike className="h-3 w-3"/> Repartidor</Badge>;
            case 'admin': return <Badge className="bg-purple-600">Admin</Badge>;
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
                        <div className="mx-auto mb-4 relative">
                            <ImageUpload 
                                currentImageUrl={profileImageUrl}
                                onImageUploaded={setProfileImageUrl}
                                folder="profiles"
                                variant="avatar"
                            />
                            <div className="absolute -bottom-2 -right-2">
                                {getRoleBadge(userProfile.role)}
                            </div>
                        </div>
                        <CardTitle>{displayName || 'Usuario'}</CardTitle>
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
                            {userProfile.role === 'store' && <TabsTrigger value="store">Configuración Tienda</TabsTrigger>}
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
                                            setIsAddingAddress(true);
                                        }} disabled={isAddingAddress}>
                                            <Plus className="h-4 w-4 mr-2" /> Nueva
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {isAddingAddress && (
                                            <div className="bg-muted/30 p-4 rounded-lg border border-primary/20 space-y-3 animate-in fade-in zoom-in-95">
                                                <h4 className="font-semibold text-sm">{newAddress.isEditing ? 'Editar' : 'Nueva'} Dirección</h4>
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <Input name="street" placeholder="Calle y Altura" value={newAddress.street} onChange={handleAddressChange} />
                                                    <Input name="city" placeholder="Ciudad / Barrio" value={newAddress.city} onChange={handleAddressChange} />
                                                    <Input name="zipCode" placeholder="C.P." value={newAddress.zipCode} onChange={handleAddressChange} />
                                                </div>
                                                <div className="flex justify-end gap-2">
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
                                                        <div className="bg-blue-50 p-2 rounded-full text-blue-600"><MapPin className="h-4 w-4"/></div>
                                                        <div>
                                                            <p className="font-medium text-sm">{addr.street}</p>
                                                            <p className="text-xs text-muted-foreground">{addr.city}, {addr.zipCode}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDeleteAddress(addr)}><Trash2 className="h-4 w-4"/></Button>
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
                                        <CardTitle>Configuración del Comercio</CardTitle>
                                        <CardDescription>Horarios y descripción pública.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Apertura</Label>
                                                <div className="relative">
                                                    <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                    <Input type="time" value={storeSchedule.open} onChange={(e) => setStoreSchedule({...storeSchedule, open: e.target.value})} className="pl-9" />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Cierre</Label>
                                                <div className="relative">
                                                    <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                    <Input type="time" value={storeSchedule.close} onChange={(e) => setStoreSchedule({...storeSchedule, close: e.target.value})} className="pl-9" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Descripción Corta (Slogan)</Label>
                                            <Input placeholder="Ej: Las mejores hamburguesas..." value={storeDescription} onChange={(e) => setStoreDescription(e.target.value)} />
                                        </div>
                                        <Button className="w-full" variant="outline" onClick={handleSaveProfile}>
                                            Actualizar Datos de Tienda
                                        </Button>
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

                                        <div className="space-y-2 pt-4 border-t">
                                            <Label className="flex items-center gap-2">
                                                <FileText className="h-4 w-4" /> Licencia de Conducir (Foto)
                                            </Label>
                                            <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-muted/20">
                                                {licenseUrl ? (
                                                    <div className="relative w-full h-40">
                                                        <img src={licenseUrl} alt="Licencia" className="w-full h-full object-contain rounded-md" />
                                                        <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => setLicenseUrl('')}>
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <ImageUpload 
                                                        onImageUploaded={setLicenseUrl}
                                                        folder="licenses"
                                                        variant="banner" 
                                                    />
                                                )}
                                                {!licenseUrl && <p className="text-xs text-muted-foreground mt-2">Sube una foto clara de tu carnet.</p>}
                                            </div>
                                        </div>

                                        <Button className="w-full bg-orange-600 hover:bg-orange-700" onClick={handleSaveProfile}>
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