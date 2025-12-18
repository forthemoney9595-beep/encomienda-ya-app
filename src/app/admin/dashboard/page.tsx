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
import { Store, Bike, Check, X, Users, DollarSign, Package, Loader2, Shield, Settings, AlertTriangle, Save, TrendingUp, Calendar, Trash2, Eye, Car, FileText, Phone, Mail, Clock, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { Order } from '@/lib/order-service'; 
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FinanceView } from './finance-view';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// --- TIPOS LOCALES ---
interface PendingUser extends UserProfile {
    id: string;
    isApproved?: boolean;
    photoURL?: string;
    profileImageUrl?: string;
    // Campos extra para mostrar detalles
    vehicle?: any;
    licenseUrl?: string;
    imageUrl?: string; // Para tiendas
    description?: string; // Para tiendas
    address?: string; // Para tiendas
    schedule?: any; // Para tiendas
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
// COMPONENTE: LISTA DE PENDIENTES (CON MODAL INTELIGENTE)
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
    const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);

    if (isLoading) return <Skeleton className="h-48 w-full" />;
    
    return (
        <>
        <Card className="h-fit shadow-md border-l-4 border-l-yellow-400">
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/10">
                <CardTitle className="text-lg font-medium">{title}</CardTitle>
                <div className="bg-white p-2 rounded-full shadow-sm">
                    <Icon className="h-5 w-5 text-yellow-600" />
                </div>
            </CardHeader>
            <CardContent className="pt-4">
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
                                    {/* 👁️ BOTÓN VER DETALLES */}
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => setSelectedUser(user)}>
                                        <Eye className="h-4 w-4" />
                                    </Button>

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

        {/* 🕵️‍♂️ MODAL DE INSPECCIÓN (ADAPTABLE) */}
        <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={selectedUser?.profileImageUrl || selectedUser?.photoURL} />
                            <AvatarFallback>{selectedUser?.displayName?.[0]}</AvatarFallback>
                        </Avatar>
                        {selectedUser?.displayName || selectedUser?.name}
                    </DialogTitle>
                    <DialogDescription>
                        Solicitud de: {selectedUser?.role === 'delivery' ? 'Repartidor' : 'Tienda'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* SI ES REPARTIDOR */}
                    {selectedUser?.role === 'delivery' && (
                        <>
                            <div className="bg-muted/30 p-3 rounded-lg border">
                                <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                                    <Car className="h-4 w-4 text-orange-600" /> Vehículo
                                </h4>
                                {selectedUser.vehicle ? (
                                    <div className="text-sm space-y-1">
                                        <p>Tipo: {selectedUser.vehicle.type || 'N/A'}</p>
                                        <p>Patente: <span className="font-mono bg-white px-1 border rounded">{selectedUser.vehicle.plate || 'N/A'}</span></p>
                                        <p>Modelo: {selectedUser.vehicle.model || 'N/A'}</p>
                                    </div>
                                ) : <p className="text-sm text-muted-foreground">Sin datos de vehículo.</p>}
                            </div>

                            <div className="bg-muted/30 p-3 rounded-lg border">
                                <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                                    <FileText className="h-4 w-4 text-blue-600" /> Licencia
                                </h4>
                                {selectedUser.licenseUrl ? (
                                    <div className="relative h-32 w-full rounded-md overflow-hidden border bg-white">
                                        <img src={selectedUser.licenseUrl} alt="Licencia" className="h-full w-full object-contain" />
                                    </div>
                                ) : <p className="text-sm text-red-500">⚠️ No subió foto de licencia.</p>}
                            </div>
                        </>
                    )}

                    {/* SI ES TIENDA */}
                    {selectedUser?.role === 'store' && (
                         <>
                            <div className="relative w-full h-32 rounded-lg overflow-hidden bg-muted">
                                {selectedUser.imageUrl ? (
                                    <img src={selectedUser.imageUrl} alt="Portada" className="w-full h-full object-cover" />
                                ) : <div className="flex items-center justify-center h-full text-muted-foreground">Sin Portada</div>}
                            </div>
                            <div className="grid gap-2 text-sm">
                                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-red-500"/> {selectedUser.address || 'Sin dirección'}</div>
                                <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-green-500"/> 
                                    {selectedUser.schedule ? `${selectedUser.schedule.open} - ${selectedUser.schedule.close}` : 'Horario no definido'}
                                </div>
                            </div>
                         </>
                    )}

                    {/* BOTONES DE ACCIÓN EN EL MODAL */}
                    <div className="flex gap-2 pt-2">
                        <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => {
                            if (selectedUser) onApprove(selectedUser.id, selectedUser.name || 'Usuario');
                            setSelectedUser(null);
                        }}>
                            Aprobar
                        </Button>
                        <Button variant="destructive" className="w-full" onClick={() => {
                             if (selectedUser) onReject(selectedUser.id, selectedUser.name || 'Usuario');
                             setSelectedUser(null);
                        }}>
                            Rechazar
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        </>
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
    
    // Filtramos los pendientes
    const pendingStores = useMemo(() => {
        return users.filter(u => u.role === 'store' && !u.isApproved).map(u => {
            const storeData = rawStores?.find((s: any) => s.ownerId === u.id);
            return { ...u, ...storeData }; 
        });
    }, [users, rawStores]);

    const pendingDelivery = users.filter(u => u.role === 'delivery' && !u.isApproved);

    const approvedStoresCount = rawStores?.filter((s: any) => s.isApproved).length || 0;
    
    const globalStats = useMemo(() => {
        const completedOrders = allOrders?.filter(o => o.status === 'Entregado') || [];
        const totalRevenue = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
        
        return {
            totalUsers: users.length,
            totalStores: approvedStoresCount, 
            totalOrders: allOrders?.length || 0,
            totalRevenue: totalRevenue
        };
    }, [allOrders, approvedStoresCount, users]);
    
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

            {/* PESTAÑAS PRINCIPALES */}
            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="mb-4">
                    <TabsTrigger value="overview">Visión General</TabsTrigger>
                    <TabsTrigger value="finances" className="text-green-700 font-semibold flex gap-2">
                        <DollarSign className="h-4 w-4" /> Finanzas y Pagos
                    </TabsTrigger>
                </TabsList>

                {/* CONTENIDO 1: VISIÓN GENERAL */}
                <TabsContent value="overview" className="space-y-6">
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
                        {/* COLUMNA IZQUIERDA: CONFIGURACIÓN Y ALERTAS */}
                        <div className="lg:col-span-3 space-y-6">
                            <Card className="border-orange-200 bg-orange-50/30 shadow-sm">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-lg font-bold flex items-center gap-2 text-orange-900">
                                        <Settings className="h-5 w-5" /> Configuración de Plataforma
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="fee" className="text-sm font-semibold">Tarifa de Servicio al Cliente (%)</Label>
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
                        </div>

                        {/* COLUMNA DERECHA: SOLO PENDIENTES (LO IMPORTANTE AHORA) */}
                        <div className="lg:col-span-4 space-y-6">
                            <PendingList 
                                title="Solicitudes: Tiendas" 
                                icon={Store} 
                                users={pendingStores} 
                                isLoading={usersLoading}
                                onApprove={(id) => handleUpdateUserStatus(id, true)}
                                onReject={(id) => handleUpdateUserStatus(id, false)}
                            />
                            <PendingList 
                                title="Solicitudes: Repartidores" 
                                icon={Bike} 
                                users={pendingDelivery} 
                                isLoading={usersLoading}
                                onApprove={(id) => handleUpdateUserStatus(id, true)}
                                onReject={(id) => handleUpdateUserStatus(id, false)}
                            />
                        </div>
                    </div>
                </TabsContent>

                {/* CONTENIDO 2: FINANZAS */}
                <TabsContent value="finances">
                    <FinanceView 
                        orders={allOrders as any[] || []} 
                        stores={rawStores || []} 
                        users={users || []} 
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}