'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getPlaceholderImage } from '@/lib/placeholder-images';
import type { UserProfile, Address } from '@/lib/user';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, Edit, Trash2, Home, Building, MapPin, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ManageAddressDialog } from './manage-address-dialog';

const profileSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z.string().email("Por favor ingresa un correo electrónico válido."),
});

interface ProfileFormProps {
    user: UserProfile;
    onSave: (data: Partial<UserProfile>) => void;
}

export function ProfileForm({ user, onSave }: ProfileFormProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isAddressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name || "",
      email: user.email || "",
    },
  });

  function onProfileSubmit(values: z.infer<typeof profileSchema>) {
    setIsSaving(true);
    onSave(values);
    setTimeout(() => {
        toast({
            title: "¡Perfil Actualizado!",
            description: "Tu información personal ha sido guardada.",
        });
        setIsSaving(false);
    }, 500);
  }

  const handleSaveAddress = (address: Address) => {
    let updatedAddresses = [...(user.addresses || [])];
    if (editingAddress) {
        updatedAddresses = updatedAddresses.map(a => a.id === address.id ? address : a);
    } else {
        updatedAddresses.push(address);
    }
    onSave({ addresses: updatedAddresses });
    toast({ title: editingAddress ? 'Dirección Actualizada' : 'Dirección Añadida' });
    setAddressDialogOpen(false);
  };

  const handleDeleteAddress = (addressId: string) => {
    const updatedAddresses = user.addresses?.filter(a => a.id !== addressId) || [];
    onSave({ addresses: updatedAddresses });
    toast({ title: 'Dirección Eliminada', variant: 'destructive' });
  };
  
  const openAddressDialog = (address: Address | null) => {
    setEditingAddress(address);
    setAddressDialogOpen(true);
  };

  const getAddressIcon = (label: Address['label']) => {
    switch(label) {
        case 'Casa': return <Home className="h-5 w-5" />;
        case 'Oficina': return <Building className="h-5 w-5" />;
        default: return <MapPin className="h-5 w-5" />;
    }
  }

  return (
    <>
    <ManageAddressDialog 
        isOpen={isAddressDialogOpen}
        setIsOpen={setAddressDialogOpen}
        onSave={handleSaveAddress}
        address={editingAddress}
    />
    <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="flex-row items-center gap-4">
              <Avatar className="h-20 w-20">
                  <AvatarImage src={getPlaceholderImage(user.name, 100, 100)} alt={user.name} />
                  <AvatarFallback className="text-2xl">{user.name?.[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                  <CardTitle className="text-2xl">{user.name}</CardTitle>
                  <CardDescription>{user.email}</CardDescription>
              </div>
        </CardHeader>
        <CardContent>
            <Tabs defaultValue="personal">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="personal">Información Personal</TabsTrigger>
                    <TabsTrigger value="addresses">Mis Direcciones</TabsTrigger>
                </TabsList>
                <TabsContent value="personal" className="pt-6">
                     <Form {...form}>
                        <form onSubmit={form.handleSubmit(onProfileSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Nombre</FormLabel>
                                    <FormControl><Input placeholder="Tu Nombre" {...field} /></FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Correo Electrónico</FormLabel>
                                    <FormControl><Input type="email" placeholder="nombre@ejemplo.com" {...field} disabled /></FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                Guardar Cambios
                            </Button>
                        </form>
                    </Form>
                </TabsContent>
                <TabsContent value="addresses" className="pt-6">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-lg font-semibold">Direcciones Guardadas</h3>
                            <p className="text-sm text-muted-foreground">Añade o edita tus lugares de entrega.</p>
                        </div>
                        <Button onClick={() => openAddressDialog(null)}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Añadir
                        </Button>
                    </div>
                    <div className="space-y-4">
                        {user.addresses && user.addresses.length > 0 ? (
                            user.addresses.map(addr => (
                                <div key={addr.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                    <div className="flex items-center gap-4">
                                        <div className="text-primary">{getAddressIcon(addr.label)}</div>
                                        <div>
                                            <p className="font-semibold">{addr.label}</p>
                                            <p className="text-sm text-muted-foreground">{`${addr.street}, ${addr.city}, ${addr.postalCode}`}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" onClick={() => openAddressDialog(addr)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                         <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                <AlertDialogTitle>¿Eliminar esta dirección?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Esta acción no se puede deshacer.
                                                </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDeleteAddress(addr.id)}>Eliminar</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-muted-foreground py-6">No tienes direcciones guardadas.</p>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </CardContent>
    </Card>
    </>
  );
}

    