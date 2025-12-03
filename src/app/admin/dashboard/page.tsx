'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth, UserProfile } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/lib/firebase';
import { collection, CollectionReference, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Store, Bike, Check, X, Users, DollarSign, Package, Loader2, Shield, Search, MoreHorizontal, Settings, AlertTriangle, Save, TrendingUp, Calendar, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { Order } from '@/lib/order-service'; 
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// --- TIPOS LOCALES ---
interface PendingUser extends UserProfile {
    id: string;
    isApproved?: boolean;
    photoURL?: string;
    profileImageUrl?: string;
}

interface PlatformConfig {
    serviceFee: number;
    maintenanceMode: boolean;
}

interface SalesData {
    name: string;
    ventas: number;
    pedidos: number;
}

// ====================================================================
// COMPONENTE: GRÁFICO SIMPLE DE VENTAS
// ====================================================================

function processOrderDataForChart(allOrders: Order[] | undefined): SalesData[] {
    if (!allOrders) return [];
    
    const today = new Date();
    const dataMap: { [key: string]: { ventas: number; pedidos: number } } = {};
    const salesData: SalesData[] = [];

    for (let i = 6; i >= 0; i--) {
        const date = subDays(today, i);
        const dateKey = format(date, 'yyyy-MM-dd');
        dataMap[dateKey] = { ventas: 0, pedidos: 0 };
    }

    const completedOrders = allOrders.filter(order => order.status === 'Entregado');

    completedOrders.forEach(order => {
        const orderDate = (order.createdAt && typeof (order.createdAt as any).toDate === 'function') 
            ? (order.createdAt as any).toDate() 
            : new Date(); 
            
        const dateKey = format(orderDate, 'yyyy-MM-dd');

        if (dataMap[dateKey]) {
            dataMap[dateKey].ventas += order.total || 0;
            dataMap[dateKey].pedidos += 1;
        }
    });

    for (const dateKey in dataMap) {
        salesData.push({
            name: format(new Date(dateKey), 'EEE', { locale: es }), 
            ventas: parseFloat(dataMap[dateKey].ventas.toFixed(2)),
            pedidos: dataMap[dateKey].pedidos,
        });
    }
    
    return salesData;
}

const SalesChart = ({ data }: { data: SalesData[] }) => {
    const maxSales = Math.max(...data.map(d => d.ventas)) || 100;

    return (
        <div className="h-64 w-full p-4">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-primary">
                <TrendingUp className="h-5 w-5" /> Tendencia de Ventas (7 Días)
            </h3>
            <div className="flex justify-between items-end h-40 border-b border-muted-foreground/30 pb-2">
                {data.map((item, index) => (
                    <div key={index} className="flex flex-col items-center group relative h-full justify-end w-full mx-1">
                        <div className="absolute bottom-full mb-2 p-1.5 rounded bg-foreground text-background text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-md">
                            ${item.ventas.toFixed(0)} ({item.pedidos} pedidos)
                        </div>
                        <div 
                            className="w-full max-w-[30px] rounded-t-sm bg-primary/80 transition-all duration-500 hover:bg-primary cursor-pointer"
                            style={{ height: `${(item.ventas / maxSales) * 95 + 5}%` }}
                        />
                        <span className="text-[10px] mt-2 text-muted-foreground uppercase font-medium">{item.name}</span>
                    </div>
                ))}
            </div>
            <p className="text-right text-xs pt-2 text-muted-foreground italic">Datos basados en pedidos marcados como "Entregado"</p>
        </div>
    );
}

// ====================================================================
// COMPONENTE: LISTA DE PENDIENTES
// ====================================================================
interface PendingListProps {
    title: string;
    icon: React.ElementType;
    users: PendingUser[];
    onApprove: (userId: string, name: string) => void;
    onReject: (userId: string, name: string) => void;
    isLoading: boolean;
}

function PendingList({ title, icon: Icon, users, onApprove, onReject, isLoading }: PendingListProps) {
    if (isLoading) return <Skeleton className="h-48 w-full" />;
    
    return (
        <Card className="h-fit">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium">{title}</CardTitle>
                <Icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                {users.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg bg-muted/5">
                        <Check className="mx-auto h-6 w-6 mb-2 text-green-500/50" />
                        <p>¡Todo al día! No hay solicitudes pendientes.</p>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                        {users.map(user => (
                            <div key={user.id} className="border p-3 rounded-lg flex items-center justify-between bg-card hover:bg-muted/50 transition-colors">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <Avatar className="h-9 w-9 border">
                                        <AvatarImage src={user.photoURL || user.profileImageUrl} />
                                        <AvatarFallback>{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div className="overflow-hidden">
                                        <p className="font-semibold text-sm truncate max-w-[120px]">{user.displayName || user.name || 'Usuario'}</p>
                                        <p className="text-xs text-muted-foreground truncate max-w-[120px]">{user.email}</p>
                                    </div>
                                </div>
                                <div className="flex space-x-1 shrink-0">
                                    <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200" onClick={() => onApprove(user.id, user.name || 'Usuario')}>
                                        <Check className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="outline" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => onReject(user.id, user.name || 'Usuario')}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ====================================================================
// COMPONENTE: TABLA DE TIENDAS ACTIVAS
// ====================================================================
function ActiveStoresTable({ 
    stores, 
    onToggleMaintenance,
    onDeleteStore 
}: { 
    stores: any[], 
    onToggleMaintenance: (id: string, currentStatus: boolean) => void,
    onDeleteStore: (id: string) => void
}) {
    return (
        <Card className="col-span-full shadow-sm">
            <CardHeader>
                <CardTitle>Gestión de Tiendas Activas</CardTitle>
                <CardDescription>Controla el estado operativo de cada tienda individualmente.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border overflow-hidden">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead>Tienda</TableHead>
                                <TableHead>Dueño</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stores.map((store) => (
                                <TableRow key={store.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <Store className="h-4 w-4 text-blue-500" />
                                            {store.name}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">{store.ownerName || 'Desconocido'}</TableCell>
                                    <TableCell>
                                        {store.maintenanceMode ? (
                                            <Badge variant="destructive" className="flex w-fit gap-1 items-center text-[10px]">
                                                <AlertTriangle className="h-3 w-3" /> En Mantenimiento
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-200 flex w-fit gap-1 items-center text-[10px]">
                                                <Check className="h-3 w-3" /> Operativa
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor={`maint-${store.id}`} className="text-xs text-muted-foreground hidden sm:block cursor-pointer">
                                                    {store.maintenanceMode ? 'Desactivar' : 'Activar'}
                                                </Label>
                                                <Switch 
                                                    id={`maint-${store.id}`}
                                                    checked={store.maintenanceMode || false}
                                                    onCheckedChange={() => onToggleMaintenance(store.id, store.maintenanceMode || false)}
                                                />
                                            </div>
                                            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => onDeleteStore(store.id)} title="Eliminar Tienda">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {stores.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No hay tiendas aprobadas aún.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

// ====================================================================
// COMPONENTE: TABLA DE GESTIÓN DE USUARIOS
// ====================================================================
function UserManagementTable({ 
    users, 
    onUpdateRole,
    onDeleteUser,
    currentUserId
}: { 
    users: PendingUser[], 
    onUpdateRole: (id: string, role: string) => void,
    onDeleteUser: (id: string) => void,
    currentUserId?: string
}) {
    const [search, setSearch] = useState('');
    
    const filteredUsers = users.filter(u => 
        u.email?.toLowerCase().includes(search.toLowerCase()) || 
        u.displayName?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Card className="col-span-full shadow-sm">
            <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle>Gestión de Usuarios</CardTitle>
                        <CardDescription>Administra roles y permisos de todos los usuarios registrados.</CardDescription>
                    </div>
                    <div className="relative w-full sm:w-64">
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
                            {filteredUsers.slice(0, 10).map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="flex items-center gap-3">
                                        <Avatar className="h-8 w-8 border">
                                            <AvatarImage src={user.photoURL || user.profileImageUrl} />
                                            <AvatarFallback>{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="font-medium text-sm">{user.displayName || 'Sin Nombre'}</div>
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
                                            <Badge variant={user.isApproved ? 'default' : 'destructive'} className="text-[10px]">
                                                {user.isApproved ? 'Aprobado' : 'Pendiente'}
                                            </Badge>
                                        ) : <span className="text-xs text-muted-foreground">-</span>}
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
                                                    <DropdownMenuItem onClick={() => onUpdateRole(user.id, 'buyer')}>Convertir en Cliente</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => onUpdateRole(user.id, 'store')}>Convertir en Tienda</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => onUpdateRole(user.id, 'delivery')}>Convertir en Repartidor</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="text-purple-600 font-bold focus:text-purple-700 focus:bg-purple-50" onClick={() => onUpdateRole(user.id, 'admin')}>
                                                        <Shield className="mr-2 h-4 w-4" /> Hacer Admin
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            {user.id !== currentUserId && (
                                                <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => onDeleteUser(user.id)} title="Eliminar Usuario">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filteredUsers.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No se encontraron usuarios.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                {filteredUsers.length > 10 && <p className="text-xs text-center mt-4 text-muted-foreground">Mostrando primeros 10 resultados.</p>}
            </CardContent>
        </Card>
    );
}

// ====================================================================
// COMPONENTE PRINCIPAL DEL DASHBOARD ADMIN
// ====================================================================

export default function AdminDashboardPage() {
    const { user, userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    
    const configRef = useMemoFirebase(() => firestore ? doc(firestore, 'config', 'platform') : null, [firestore]);
    const { data: configData } = useDoc<PlatformConfig>(configRef);

    const [localConfig, setLocalConfig] = useState<PlatformConfig>({ serviceFee: 10, maintenanceMode: false });
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleteType, setDeleteType] = useState<'store' | 'user' | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (configData) setLocalConfig(configData);
    }, [configData]);

    const usersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'users') : null, [firestore]);
    const { data: rawUsers, isLoading: usersLoading } = useCollection<PendingUser>(usersQuery);
    
    const allOrdersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'orders') as CollectionReference<Order> : null, [firestore]);
    const { data: allOrders, isLoading: ordersLoading } = useCollection<Order>(allOrdersQuery);
    
    const storesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'stores') : null, [firestore]);
    const { data: rawStores, isLoading: storesLoading } = useCollection<any>(storesQuery);

    const users = useMemo(() => rawUsers?.map(u => ({ ...u, id: (u as any).id, isApproved: u.isApproved ?? false })) || [], [rawUsers]);
    
    const pendingStores = users.filter(u => u.role === 'store' && !u.isApproved);
    const pendingDelivery = users.filter(u => u.role === 'delivery' && !u.isApproved);

    const approvedStores = useMemo(() => {
        if (!rawStores || !users) return [];
        return rawStores.filter((s: any) => s.isApproved).map((store: any) => {
            const owner = users.find(u => u.id === store.ownerId);
            return { ...store, ownerName: owner?.displayName || owner?.name || 'Desconocido' };
        });
    }, [rawStores, users]);
    
    const globalStats = useMemo(() => {
        const completedOrders = allOrders?.filter(o => o.status === 'Entregado') || [];
        const totalRevenue = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
        
        return {
            totalUsers: users.length,
            totalStores: approvedStores.length, 
            totalOrders: allOrders?.length || 0,
            totalRevenue: totalRevenue
        };
    }, [allOrders, approvedStores, users]);
    
    const chartData = useMemo(() => processOrderDataForChart(allOrders || undefined), [allOrders]);

    useEffect(() => {
        if (!authLoading && userProfile?.role !== 'admin') {
            router.push('/'); 
        }
    }, [authLoading, userProfile, router]);

    // --- HANDLERS ---

    const handleUpdateUserStatus = async (userId: string, isApproved: boolean) => {
        if (!firestore) return;
        try {
            await updateDoc(doc(firestore, 'users', userId), { isApproved });
            const relatedStore = rawStores?.find((s: any) => s.ownerId === userId);
            if (relatedStore) {
                 await updateDoc(doc(firestore, 'stores', relatedStore.id), { isApproved });
            }
            toast({ title: isApproved ? 'Usuario Aprobado' : 'Usuario Rechazado' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error al actualizar' });
        }
    };

    const handleToggleStoreMaintenance = async (storeId: string, currentStatus: boolean) => {
        if (!firestore) return;
        try {
            await updateDoc(doc(firestore, 'stores', storeId), { maintenanceMode: !currentStatus });
            toast({ 
                title: !currentStatus ? 'Tienda en Mantenimiento' : 'Tienda Activada',
                description: `El estado de la tienda se ha actualizado.` 
            });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al cambiar estado' });
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        if (!firestore) return;
        if (!confirm(`¿Estás seguro de cambiar el rol de este usuario a ${newRole}?`)) return;
        
        try {
            await updateDoc(doc(firestore, 'users', userId), { role: newRole });
            toast({ title: 'Rol actualizado', description: `El usuario ahora es ${newRole}.` });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al cambiar rol' });
        }
    }

    const handleSaveConfig = async () => {
        if (!firestore) return;
        setIsSavingConfig(true);
        try {
            await setDoc(doc(firestore, 'config', 'platform'), localConfig, { merge: true });
            toast({ title: 'Configuración guardada', description: 'Los cambios se aplicarán globalmente.' });
        } catch (error) {
            console.error("Error guardando config:", error);
            toast({ variant: 'destructive', title: 'Error al guardar', description: 'Verifica los permisos de la colección config.' });
        } finally {
            setIsSavingConfig(false);
        }
    };

    const confirmDelete = (id: string, type: 'store' | 'user') => {
        setDeleteId(id);
        setDeleteType(type);
    };

    const handleDelete = async () => {
        if (!firestore || !deleteId || !deleteType) return;
        setIsDeleting(true);
        try {
            const collectionName = deleteType === 'store' ? 'stores' : 'users';
            await deleteDoc(doc(firestore, collectionName, deleteId));
            
            toast({ title: `${deleteType === 'store' ? 'Tienda' : 'Usuario'} eliminado permanentemente` });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Error al eliminar" });
        } finally {
            setIsDeleting(false);
            setDeleteId(null);
            setDeleteType(null);
        }
    };

    if (authLoading || userProfile?.role !== 'admin') {
        return <div className="container mx-auto py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="container mx-auto pb-20 space-y-8">
            <PageHeader 
                title="Panel de Control" 
                description="Visión general del estado de la plataforma." 
            />

            {/* METRICAS PRINCIPALES */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Ingresos Totales</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">${globalStats.totalRevenue.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground mt-1">Volumen bruto procesado</p>
                    </CardContent>
                </Card>
                
                <Card className="shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pedidos</CardTitle>
                        <Package className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{globalStats.totalOrders}</div>
                        <p className="text-xs text-muted-foreground mt-1">Total histórico</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Usuarios</CardTitle>
                        <Users className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{globalStats.totalUsers}</div>
                        <p className="text-xs text-muted-foreground mt-1">Registrados en la plataforma</p>
                    </CardContent>
                </Card>
            </div>

            {/* SECCIÓN GRÁFICOS */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Calendar className="h-5 w-5 text-primary" /> Rendimiento Semanal
                    </CardTitle>
                    <CardDescription>Ventas y volumen de pedidos de los últimos 7 días (basado en órdenes Entregadas).</CardDescription>
                </CardHeader>
                <CardContent>
                    <SalesChart data={chartData} />
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                {/* COLUMNA IZQUIERDA: CONFIGURACIÓN Y PENDIENTES */}
                <div className="lg:col-span-3 space-y-6">
                    <Card className="border-orange-200 bg-orange-50/30 shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-orange-900">
                                <Settings className="h-5 w-5" /> Configuración de Plataforma
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="fee" className="text-sm font-semibold">Comisión de Servicio (%)</Label>
                                <div className="relative">
                                    <Input 
                                        id="fee"
                                        type="number" 
                                        value={localConfig.serviceFee}
                                        onChange={(e) => setLocalConfig({...localConfig, serviceFee: Number(e.target.value)})}
                                        className="pl-8 bg-white text-black border-orange-200 focus-visible:ring-orange-500" 
                                    />
                                    <span className="absolute left-3 top-2.5 text-muted-foreground font-bold">%</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">Esta comisión se aplicará a los futuros pedidos.</p>
                            </div>

                            <div className="flex items-center justify-between border border-orange-200 p-3 rounded-lg bg-white/80 backdrop-blur-sm">
                                <div className="space-y-0.5">
                                    <Label className="text-base font-bold text-red-600 flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4" /> Modo Mantenimiento
                                    </Label>
                                    <p className="text-xs text-muted-foreground">Impide crear nuevos pedidos.</p>
                                </div>
                                <Switch 
                                    checked={localConfig.maintenanceMode}
                                    onCheckedChange={(checked) => setLocalConfig({...localConfig, maintenanceMode: checked})}
                                    className="data-[state=checked]:bg-red-600"
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white" onClick={handleSaveConfig} disabled={isSavingConfig}>
                                {isSavingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {isSavingConfig ? "Guardando..." : "Guardar Configuración"}
                            </Button>
                        </CardFooter>
                    </Card>

                    <PendingList 
                        title="Tiendas por Aprobar" 
                        icon={Store} 
                        users={pendingStores} 
                        isLoading={usersLoading}
                        onApprove={(id) => handleUpdateUserStatus(id, true)}
                        onReject={(id) => handleUpdateUserStatus(id, false)}
                    />
                    <PendingList 
                        title="Repartidores por Aprobar" 
                        icon={Bike} 
                        users={pendingDelivery} 
                        isLoading={usersLoading}
                        onApprove={(id) => handleUpdateUserStatus(id, true)}
                        onReject={(id) => handleUpdateUserStatus(id, false)}
                    />
                </div>

                {/* COLUMNA DERECHA: TIENDAS Y USUARIOS */}
                <div className="lg:col-span-4 space-y-6">
                    <ActiveStoresTable stores={approvedStores} onToggleMaintenance={handleToggleStoreMaintenance} onDeleteStore={(id) => confirmDelete(id, 'store')} />
                    <UserManagementTable users={users} onUpdateRole={handleRoleChange} onDeleteUser={(id) => confirmDelete(id, 'user')} currentUserId={user?.uid} />
                </div>
            </div>

            {/* DIÁLOGO DE ELIMINACIÓN */}
            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                        Esta acción no se puede deshacer. Se eliminará permanentemente 
                        {deleteType === 'store' ? ' la tienda y sus productos' : ' el perfil del usuario'} de la base de datos.
                        {deleteType === 'store' && " La tienda dejará de aparecer en el inicio inmediatamente."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={(e) => { e.preventDefault(); handleDelete(); }} 
                            className="bg-red-600 hover:bg-red-700"
                            disabled={isDeleting}
                        >
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        {isDeleting ? "Eliminando..." : "Sí, eliminar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}