'use client';

import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, Search, MoreHorizontal, Shield, Trash2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AdminAuthGuard from '../admin-auth-guard';

function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');

  // 1. Cargar TODOS los usuarios
  const usersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'users') : null, [firestore]);
  const { data: users, isLoading } = useCollection<any>(usersQuery);

  // 2. Filtrar por búsqueda
  const filteredUsers = users?.filter(u => 
    u.email?.toLowerCase().includes(search.toLowerCase()) || 
    u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    u.name?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  // --- ACCIONES ---

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!firestore) return;
    if (!confirm(`¿Estás seguro de cambiar el rol de este usuario a ${newRole}?`)) return;
    
    try {
        await updateDoc(doc(firestore, 'users', userId), { role: newRole });
        toast({ title: 'Rol actualizado', description: `El usuario ahora es ${newRole}.` });
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error al cambiar rol' });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!firestore) return;
    if (!confirm("⚠️ ¿Estás seguro? Esta acción eliminará al usuario permanentemente.")) return;

    try {
        await deleteDoc(doc(firestore, 'users', userId));
        toast({ title: 'Usuario eliminado' });
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error al eliminar' });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto space-y-6">
      <PageHeader 
        title="Gestión de Usuarios" 
        description="Administra clientes, asigna roles y mantén limpia la base de datos." 
      />

      <Card>
        <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" /> Base de Usuarios ({filteredUsers.length})
                    </CardTitle>
                </div>
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Buscar por nombre o email..." 
                        className="pl-8" 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>
        </CardHeader>
        <CardContent>
            <div className="rounded-md border overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead>Usuario</TableHead>
                            <TableHead>Rol Actual</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredUsers.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="flex items-center gap-3">
                                    <Avatar className="h-9 w-9 border">
                                        <AvatarImage src={user.photoURL || user.profileImageUrl} />
                                        <AvatarFallback>{user.displayName?.charAt(0) || user.name?.charAt(0) || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="font-medium text-sm">{user.displayName || user.name || 'Sin Nombre'}</div>
                                        <div className="text-xs text-muted-foreground">{user.email}</div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={
                                        user.role === 'admin' ? 'border-purple-500 text-purple-600 bg-purple-50' :
                                        user.role === 'store' ? 'border-blue-500 text-blue-600 bg-blue-50' :
                                        user.role === 'delivery' ? 'border-orange-500 text-orange-600 bg-orange-50' : 
                                        'bg-gray-100 text-gray-600 border-gray-200'
                                    }>
                                        {user.role === 'buyer' ? 'Cliente' : user.role === 'store' ? 'Tienda' : user.role === 'delivery' ? 'Repartidor' : 'Admin'}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {user.role === 'store' || user.role === 'delivery' ? (
                                        <Badge variant={user.isApproved ? 'default' : 'secondary'} className="text-[10px]">
                                            {user.isApproved ? 'Aprobado' : 'Pendiente'}
                                        </Badge>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-muted">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuLabel>Cambiar Rol</DropdownMenuLabel>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'buyer')}>Convertir en Cliente</DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'store')}>Convertir en Tienda</DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'delivery')}>Convertir en Repartidor</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-purple-600 font-bold focus:text-purple-700 focus:bg-purple-50" onClick={() => handleRoleChange(user.id, 'admin')}>
                                                    <Shield className="mr-2 h-4 w-4" /> Hacer Admin
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        
                                        {user.id !== currentUser?.uid && (
                                            <Button variant="destructive" size="icon" className="h-8 w-8 opacity-70 hover:opacity-100" onClick={() => handleDeleteUser(user.id)} title="Eliminar Usuario">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredUsers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                    No se encontraron usuarios que coincidan con "{search}".
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function GuardedAdminUsersPage() {
    return (
        <AdminAuthGuard>
            <AdminUsersPage />
        </AdminAuthGuard>
    )
}