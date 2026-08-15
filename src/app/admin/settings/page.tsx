'use client';

import { useEffect, useState } from 'react';
import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useFirestore, useMemoFirebase, useDoc } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { logAdminAction } from '@/lib/admin-audit';
import { Settings, AlertTriangle, Save, Loader2 } from 'lucide-react';

interface PlatformConfig {
  serviceFee: number;
  deliveryFee?: number;
  // Envío según distancia (Fase RR ter): 0 en $/km = envío fijo (comportamiento clásico)
  deliveryFeePerKm?: number;
  deliveryIncludedKm?: number;
  maxDeliveryDistanceKm?: number;
  defaultCommissionRate?: number;
  maintenanceMode: boolean;
  settlementDayOfWeek?: number;
  claimWindowHours?: number;
}

function AdminSettingsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user: adminUser } = useAuth();

  const configRef = useMemoFirebase(() => firestore ? doc(firestore, 'config', 'platform') : null, [firestore]);
  const { data: configData, isLoading: configLoading } = useDoc<PlatformConfig>(configRef);

  const [localConfig, setLocalConfig] = useState<PlatformConfig>({ serviceFee: 10, deliveryFee: 2000, defaultCommissionRate: 10, maintenanceMode: false, settlementDayOfWeek: 5, claimWindowHours: 24 });
  const [isSaving, setIsSaving] = useState(false);
  // 🚨 Tanda A de la auditoría: hasta que la config REAL no llegue de Firestore, el form
  // muestra defaults hardcodeados — un "Guardar" en ese instante los escribía POR ENCIMA
  // de la configuración real de la plataforma (fees, comisiones, día de liquidación).
  // Este flag bloquea el render del form y el guardado hasta tener el dato real.
  const configReady = !configLoading && configData !== undefined;

  useEffect(() => {
    if (configData) setLocalConfig({ serviceFee: 10, deliveryFee: 2000, defaultCommissionRate: 10, settlementDayOfWeek: 5, maintenanceMode: false, claimWindowHours: 24, ...configData });
  }, [configData]);

  const handleSave = async () => {
    if (!firestore) return;
    if (!configReady) {
      toast({ variant: 'destructive', title: 'Esperá un segundo', description: 'La configuración actual todavía está cargando.' });
      return;
    }

    // El modo mantenimiento corta los pedidos en TODA la plataforma -- pedía menos
    // confirmación que cancelar un solo pedido. Solo se pregunta al ACTIVARLO.
    const turningOnMaintenance = localConfig.maintenanceMode && !configData?.maintenanceMode;
    if (turningOnMaintenance && !confirm('⚠️ Vas a activar el MODO MANTENIMIENTO: ningún cliente va a poder hacer pedidos en toda la plataforma hasta que lo desactives. ¿Confirmás?')) {
      return;
    }

    setIsSaving(true);
    try {
      await setDoc(doc(firestore, 'config', 'platform'), localConfig, { merge: true });
      // Cambiar fees o el día de liquidación afecta plata de todas las tiendas y
      // repartidores -- antes no quedaba registro de quién lo cambió ni cuándo.
      if (adminUser) {
        const changes = [
          configData?.serviceFee !== localConfig.serviceFee ? `serviceFee: ${configData?.serviceFee ?? '—'}% → ${localConfig.serviceFee}%` : null,
          configData?.deliveryFee !== localConfig.deliveryFee ? `envío: $${configData?.deliveryFee ?? '—'} → $${localConfig.deliveryFee}` : null,
          configData?.deliveryFeePerKm !== localConfig.deliveryFeePerKm ? `envío $/km: $${configData?.deliveryFeePerKm ?? 0} → $${localConfig.deliveryFeePerKm ?? 0}` : null,
          configData?.deliveryIncludedKm !== localConfig.deliveryIncludedKm ? `km incluidos: ${configData?.deliveryIncludedKm ?? 5} → ${localConfig.deliveryIncludedKm ?? 5}` : null,
          configData?.maxDeliveryDistanceKm !== localConfig.maxDeliveryDistanceKm ? `distancia máx: ${configData?.maxDeliveryDistanceKm ?? 50}km → ${localConfig.maxDeliveryDistanceKm ?? 50}km` : null,
          configData?.defaultCommissionRate !== localConfig.defaultCommissionRate ? `comisión default: ${configData?.defaultCommissionRate ?? '—'}% → ${localConfig.defaultCommissionRate}%` : null,
          configData?.settlementDayOfWeek !== localConfig.settlementDayOfWeek ? `día liquidación: ${localConfig.settlementDayOfWeek}` : null,
          configData?.claimWindowHours !== localConfig.claimWindowHours ? `ventana de reclamo: ${configData?.claimWindowHours ?? '—'}h → ${localConfig.claimWindowHours}h` : null,
          configData?.maintenanceMode !== localConfig.maintenanceMode ? `mantenimiento: ${localConfig.maintenanceMode ? 'ON' : 'OFF'}` : null,
        ].filter(Boolean).join(' · ');
        if (changes) logAdminAction(firestore, adminUser.uid, 'update_config', 'platform', changes);
      }
      toast({ title: 'Configuración guardada', description: 'Los cambios se aplicarán globalmente.' });
    } catch (error) {
      console.error('Error guardando config:', error);
      toast({ variant: 'destructive', title: 'Error al guardar', description: 'Verificá los permisos de la colección config.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Ver comentario de configReady: nunca mostrar el form con defaults inventados.
  if (!configReady) {
    return (
      <div className="container mx-auto pb-20 space-y-6 max-w-2xl">
        <PageHeader title="Configuración" description="Parámetros globales de la plataforma." />
        <div className="h-96 w-full rounded-xl bg-muted/40 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="container mx-auto pb-20 space-y-6 max-w-2xl">
      <PageHeader title="Configuración" description="Parámetros globales de la plataforma." />

      <Card className="border-primary/30 bg-primary/5 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Settings className="h-5 w-5" /> Configuración de Plataforma
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fee" className="text-sm font-semibold">Tarifa de Servicio al Cliente (%)</Label>
            <div className="relative">
              <Input id="fee" type="number" value={localConfig.serviceFee}
                onChange={(e) => setLocalConfig({ ...localConfig, serviceFee: Number(e.target.value) })}
                className="pl-8 border-primary/30" />
              <span className="absolute left-3 top-2.5 text-muted-foreground font-bold">%</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deliveryFee" className="text-sm font-semibold">Fee de envío fijo (ARS)</Label>
            <div className="relative">
              <Input id="deliveryFee" type="number" value={localConfig.deliveryFee ?? 2000}
                onChange={(e) => setLocalConfig({ ...localConfig, deliveryFee: Number(e.target.value) })}
                className="pl-8 border-primary/30" />
              <span className="absolute left-3 top-2.5 text-muted-foreground font-bold text-xs">$</span>
            </div>
            <p className="text-xs text-muted-foreground">Costo de envío que se suma a cada pedido. Default: $2000.</p>
          </div>

          {/* Envío según distancia (Fase RR ter) — con $/km en 0 el envío es fijo como siempre */}
          <div className="space-y-2">
            <Label htmlFor="feePerKm" className="text-sm font-semibold">Adicional por distancia ($ por km extra)</Label>
            <div className="relative">
              <Input id="feePerKm" type="number" min={0} value={localConfig.deliveryFeePerKm ?? 0}
                onChange={(e) => setLocalConfig({ ...localConfig, deliveryFeePerKm: Number(e.target.value) })}
                className="pl-8 border-primary/30" />
              <span className="absolute left-3 top-2.5 text-muted-foreground font-bold text-xs">$</span>
            </div>
            <p className="text-xs text-muted-foreground">
              En 0 (default) el envío es fijo. Si lo activás, cada km EMPEZADO más allá de los
              km incluidos suma este monto (distancia tienda→cliente en línea recta — el camino
              real por calle es algo más largo, calibrar sabiendo eso). Ej: base $2.000 + $500/km
              con 5 km incluidos → Santa Rosa (~10 km) paga $2.000 + 5×$500 = $4.500.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="includedKm" className="text-sm font-semibold">Km incluidos en el envío base</Label>
            <Input id="includedKm" type="number" min={0} value={localConfig.deliveryIncludedKm ?? 5}
              onChange={(e) => setLocalConfig({ ...localConfig, deliveryIncludedKm: Number(e.target.value) })}
              className="border-primary/30" />
            <p className="text-xs text-muted-foreground">
              Hasta esta distancia se cobra solo la base (default: 5 km — cubre todo el casco
              urbano de Tinogasta). Solo aplica si el adicional por km está activo.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxKm" className="text-sm font-semibold">Distancia máxima de entrega (km)</Label>
            <Input id="maxKm" type="number" min={0} value={localConfig.maxDeliveryDistanceKm ?? 50}
              onChange={(e) => setLocalConfig({ ...localConfig, maxDeliveryDistanceKm: Number(e.target.value) })}
              className="border-primary/30" />
            <p className="text-xs text-muted-foreground">
              Cerco anti-error: si el pin del cliente queda a más de esto de la tienda, el pedido
              se rechaza con un aviso para revisar el mapa. Es a propósito GENEROSO (default 50 km
              — Santa Rosa y los parajes cercanos entran sobrados): frena al GPS que marcó otra
              provincia, no define la zona de reparto.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="commission" className="text-sm font-semibold">Comisión por defecto a tiendas (%)</Label>
            <div className="relative">
              <Input id="commission" type="number" value={localConfig.defaultCommissionRate ?? 10}
                onChange={(e) => setLocalConfig({ ...localConfig, defaultCommissionRate: Number(e.target.value) })}
                className="pl-8 border-primary/30" />
              <span className="absolute left-3 top-2.5 text-muted-foreground font-bold">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Se aplica a las tiendas que no tengan una comisión propia cargada. Antes esas
              tiendas quedaban en 0% sin que nadie lo notara — o sea, operaban gratis.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="claimWindow" className="text-sm font-semibold">Ventana de reclamo del comprador (horas)</Label>
            <Input id="claimWindow" type="number" min={1} value={localConfig.claimWindowHours ?? 24}
              onChange={(e) => setLocalConfig({ ...localConfig, claimWindowHours: Number(e.target.value) })}
              className="border-primary/30" />
            <p className="text-xs text-muted-foreground">
              Cuántas horas después de la entrega el cliente puede reportar un problema con su
              pedido. Default: 24h. Si algún rubro (ej. supermercados) necesita más margen, se
              sube acá sin tocar código.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Día de liquidación automática</Label>
            <select value={localConfig.settlementDayOfWeek ?? 5}
              onChange={(e) => setLocalConfig({ ...localConfig, settlementDayOfWeek: Number(e.target.value) })}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground">
              {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">El cron genera automáticamente los retiros pendientes ese día.</p>
          </div>

          <div className="flex items-center justify-between border border-border p-3 rounded-lg bg-muted/30 backdrop-blur-sm">
            <div className="space-y-0.5">
              <Label className="text-base font-bold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Modo Mantenimiento
              </Label>
              <p className="text-xs text-muted-foreground">Impide crear nuevos pedidos.</p>
            </div>
            <Switch checked={localConfig.maintenanceMode}
              onCheckedChange={(checked) => setLocalConfig({ ...localConfig, maintenanceMode: checked })}
              className="data-[state=checked]:bg-destructive" />
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isSaving ? 'Guardando...' : 'Guardar Configuración'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function AdminSettingsPageGuarded() {
  return <AdminAuthGuard requireFullAdmin><AdminSettingsPage /></AdminAuthGuard>;
}
