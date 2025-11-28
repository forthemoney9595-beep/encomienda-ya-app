'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
// ✅ IMPORTANTE: Importamos desde @/lib/firebase
import { useFirestore } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { User, Mail, MapPin, Save, Plus, X, List, Phone, Trash2, Pencil, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
// ✅ IMPORTANTE: Importamos el componente de subida de imágenes
import { ImageUpload } from '@/components/image-upload';

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
    
    const [isAddingAddress, setIsAddingAddress] = useState(false);
    
    const [displayName, setDisplayName] = useState('');
    const [profileImageUrl, setProfileImageUrl] = useState('');
    const [phoneNumber, setPhoneNumber] = useState(''); 
    const [isSavingUser, setIsSavingUser] = useState(false);
    
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [newAddress, setNewAddress] = useState<Omit<Address, 'id'> & { isEditing: boolean, id: string }>({ 
        id: '',
        street: '', 
        city: '', 
        zipCode: '', 
        isEditing: false 
    });

    // Reemplazamos useMemoFirebase por useMemo estándar
    const userDocRef = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user?.uid]);

    useEffect(() => {
        if (userProfile) {
            setDisplayName(userProfile.displayName || '');
            // Buscamos profileImageUrl O photoURL
            const photo = (userProfile as any).profileImageUrl || (userProfile as any).photoURL || '';
            setProfileImageUrl(photo);
            
            setPhoneNumber(userProfile.phoneNumber || ''); 
            setAddresses(userProfile.addresses as Address[] || []);
        }
    }, [userProfile]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [authLoading, user, router]);

    // ✅ Callback cuando el componente ImageUpload termina de subir la foto
    const handleImageUploaded = (url: string) => {
        setProfileImageUrl(url);
        // Opcional: Podrías guardar automáticamente aquí si quisieras, 
        // pero dejaremos que el usuario pulse "Guardar Perfil" para confirmar todo junto.
    };

    // --- Lógica de Gestión de Perfil ---
    const handleSaveProfile = async () => {
        if (!userDocRef) return;
        setIsSavingUser(true);
        try {
            await updateDoc(userDocRef, {
                displayName: displayName.trim(),
                profileImageUrl: profileImageUrl, // URL de Firebase Storage
                photoURL: profileImageUrl,        // Compatibilidad
                phoneNumber: phoneNumber.trim(), 
            });
            toast({ title: '¡Éxito!', description: 'Perfil actualizado correctamente.' });
        } catch (error) {
            console.error('Error al guardar el perfil:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el perfil.' });
        } finally {
            setIsSavingUser(false);
        }
    };
    
    // --- Lógica de Gestión de Direcciones ---
    const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setNewAddress(prev => ({ ...prev, [name]: value }));
    };

    const handleAddAddress = async () => {
        if (!userDocRef || !newAddress.street || !newAddress.city || !newAddress.zipCode) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, rellena todos los campos de la dirección.' });
            return;
        }

        const addressToSave = {
            id: newAddress.id || Math.random().toString(36).substring(2, 9),
            street: newAddress.street.trim(),
            city: newAddress.city.trim(),
            zipCode: newAddress.zipCode.trim(),
            label: `${newAddress.street.trim()}, ${newAddress.city.trim()}`,
        };
        
        if (newAddress.isEditing) {
            const oldAddress = addresses.find(a => a.id === newAddress.id);
            if (oldAddress) {
                await updateDoc(userDocRef, {
                    addresses: arrayRemove(oldAddress)
                });
            }
        }
        
        try {
            await updateDoc(userDocRef, {
                addresses: arrayUnion(addressToSave)
            });

            toast({ 
                title: '¡Éxito!', 
                description: `Dirección ${newAddress.isEditing ? 'actualizada' : 'añadida'} correctamente.` 
            });
            
            setNewAddress({ id: '', street: '', city: '', zipCode: '', isEditing: false });
            setIsAddingAddress(false);
        } catch(error) {
            console.error('Error al guardar la dirección:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la dirección.' });
        }
    };
    
    const handleDeleteAddress = async (address: Address) => {
        if (!userDocRef || !window.confirm(`¿Estás seguro de que quieres eliminar la dirección "${address.street}"?`)) return;

        try {
            await updateDoc(userDocRef, {
                addresses: arrayRemove(address)
            });
            toast({ title: 'Eliminado', description: 'Dirección eliminada correctamente.' });
        } catch (error) {
            console.error('Error al eliminar la dirección:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la dirección.' });
        }
    };

    const handleEditAddress = (address: Address) => {
        setNewAddress({ 
            id: address.id, 
            street: address.street, 
            city: address.city, 
            zipCode: address.zipCode, 
            isEditing: true 
        });
        setIsAddingAddress(true);
    };
    
    const handleOpenAddForm = () => {
        setNewAddress({ id: '', street: '', city: '', zipCode: '', isEditing: false });
        setIsAddingAddress(true);
    }
    const handleCloseForm = () => {
         setNewAddress({ id: '', street: '', city: '', zipCode: '', isEditing: false });
         setIsAddingAddress(false);
    }

    if (authLoading || !userProfile) {
        return (
            <div className="container mx-auto space-y-4">
                <PageHeader title="Mi Perfil" description="Cargando información..." />
                <div className="grid gap-6 md:grid-cols-3">
                    <Skeleton className="h-[200px]" />
                    <Skeleton className="md:col-span-2 h-[350px]" />
                </div>
            </div>
        );
    }

    const getRoleBadge = (role?: string) => {
        switch(role) {
            case 'store': return <Badge className="bg-blue-600">Vendedor</Badge>;
            case 'delivery': return <Badge className="bg-orange-600">Repartidor</Badge>;
            case 'admin': return <Badge className="bg-purple-600">Admin</Badge>;
            default: return <Badge variant="secondary">Cliente</Badge>;
        }
    };

    return (
        <div className="container mx-auto pb-20">
            <PageHeader 
                title="Mi Perfil" 
                description="Actualiza tu información personal y gestiona tus direcciones." 
            />

            <div className="grid gap-6 lg:grid-cols-3">
                
                <Card className="lg:col-span-1 h-fit">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xl">Información General</CardTitle>
                        {getRoleBadge(userProfile.role)}
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex flex-col items-center justify-center space-y-4 pt-2">
                            
                            {/* ✅ Integración del componente ImageUpload */}
                            <ImageUpload 
                                currentImageUrl={profileImageUrl}
                                onImageUploaded={handleImageUploaded}
                                folder="profiles"
                                variant="avatar"
                            />

                            <div className="text-center">
                                <h3 className="text-lg font-semibold">{displayName || 'Usuario'}</h3>
                                <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                                    <Mail className="h-3 w-3" /> {userProfile.email}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="displayName">Nombre de Usuario</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        id="displayName" 
                                        value={displayName} 
                                        onChange={(e) => setDisplayName(e.target.value)} 
                                        placeholder="Tu nombre público"
                                        className="pl-9"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phoneNumber">Teléfono</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        id="phoneNumber" 
                                        type="tel"
                                        value={phoneNumber} 
                                        onChange={(e) => setPhoneNumber(e.target.value)} 
                                        placeholder="+54 9 11 ..."
                                        className="pl-9"
                                    />
                                </div>
                            </div>
                        </div>

                        <Button onClick={handleSaveProfile} className="w-full" disabled={isSavingUser}>
                            {isSavingUser ? (
                                <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando... </>
                            ) : (
                                <> <Save className="mr-2 h-4 w-4" /> Guardar Perfil </>
                            )}
                        </Button>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-xl">Mis Direcciones de Envío</CardTitle>
                        <MapPin className="h-5 w-5 text-primary" />
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex justify-end">
                            <Button 
                                variant="outline" 
                                onClick={isAddingAddress ? handleCloseForm : handleOpenAddForm}
                                className={newAddress.isEditing ? "hidden" : ""}
                            >
                                {isAddingAddress ? <List className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                                {isAddingAddress ? 'Ver lista' : 'Añadir nueva'}
                            </Button>
                        </div>
                          
                        {isAddingAddress || newAddress.isEditing ? (
                            <div className="border p-4 rounded-lg bg-secondary/10 space-y-3 animate-in fade-in slide-in-from-top-2">
                                <h4 className="text-lg font-semibold flex items-center">
                                    {newAddress.isEditing ? 'Editar Dirección' : 'Añadir Nueva Dirección'}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="space-y-1 md:col-span-2">
                                        <Label htmlFor="street">Calle y Número</Label>
                                        <Input 
                                            id="street" 
                                            name="street" 
                                            value={newAddress.street} 
                                            onChange={handleAddressChange} 
                                            placeholder="Ej: Av. Principal 1234"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="city">Ciudad</Label>
                                        <Input 
                                            id="city" 
                                            name="city" 
                                            value={newAddress.city} 
                                            onChange={handleAddressChange} 
                                            placeholder="Ej: Buenos Aires"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="zipCode">Código Postal</Label>
                                        <Input 
                                            id="zipCode" 
                                            name="zipCode" 
                                            value={newAddress.zipCode} 
                                            onChange={handleAddressChange} 
                                            placeholder="Ej: 1001"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    {newAddress.isEditing && (
                                        <Button 
                                            variant="ghost" 
                                            onClick={handleCloseForm}
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <X className="h-4 w-4 mr-2" /> Cancelar
                                        </Button>
                                    )}
                                    <Button onClick={handleAddAddress}>
                                        {newAddress.isEditing ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                                        {newAddress.isEditing ? 'Actualizar' : 'Guardar'}
                                    </Button>
                                </div>
                            </div>
                        ) : null}

                        {(!isAddingAddress || addresses.length === 0) && (
                            <div className="space-y-3 pt-2">
                                {addresses.length === 0 ? (
                                    <div className="text-center py-8 border-dashed border-2 rounded-lg bg-muted/20">
                                        <MapPin className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                                        <p className="text-muted-foreground">No tienes direcciones guardadas.</p>
                                    </div>
                                ) : (
                                    addresses.map((address) => (
                                        <div key={address.id} className="p-4 flex items-center justify-between bg-card border rounded-lg hover:shadow-sm transition-all group">
                                            <div className="flex items-start gap-3 overflow-hidden">
                                                <div className="mt-1 bg-primary/10 p-2 rounded-full">
                                                    <MapPin className="h-4 w-4 text-primary" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-sm truncate">{address.street}</p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {address.city}, C.P. {address.zipCode}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex space-x-1 shrink-0 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleEditAddress(address)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteAddress(address)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}