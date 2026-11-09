'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Store as StoreIcon, LocateFixed, CheckCircle2, Clock, MapPin, AlertTriangle, Plus, X, Truck, CalendarDays, Trash2 } from 'lucide-react';
import PageHeader from '@/components/page-header';
import { ImageUpload } from '@/components/image-upload';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  type WeeklySchedule, type TimeRange, normalizeWeeklySchedule, defaultWeeklySchedule, DAY_LABELS, DISPLAY_ORDER,
  normalizeSpecialHours, validateSpecialDays, buildSpecialHours, dateKey, addDaysWall, nowInArgentina, isValidDateKey,
} from '@/lib/store-hours';
import { STORE_CATEGORIES } from '@/lib/store-categories';
import { capturePosition } from '@/lib/geo';
import { LocationPicker } from '@/components/location-picker';
import { StorePauseControl } from '@/components/store-pause-control';

// Deriva un {open,close} representativo (primera franja de un día abierto) para mantener
// vivos lectores legacy que todavía no usan el helper store-hours.
function legacyScheduleMirror(week: WeeklySchedule): { open: string; close: string } {
  const day = week.find(d => !d.closed && d.ranges.length > 0);
  const r = day?.ranges[0];
  return r ? { open: r.open, close: r.close } : { open: '09:00', close: '22:00' };
}

// ── Horario especial por fecha (nov 2026) ─────────────────────────────────────────────
// Fila del editor: `id` local estable (la lista se reordena por fecha y React tiene que
// seguir sabiendo qué input es cuál).
type SpecialDraft = { id: string; date: string; closed: boolean; ranges: TimeRange[] };
const MAX_SPECIAL_DAYS = 30;
let draftSeq = 0;
const newDraftId = () => `sd-${Date.now().toString(36)}-${draftSeq++}`;
// Sin fecha va al final (recién agregada, todavía sin elegir).
const sortDrafts = (list: SpecialDraft[]) =>
  [...list].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
// JSON con claves ordenadas: para saber si el horario especial cambió y no reescribirlo de
// gusto (así una tienda que no toca esta sección guarda igual que antes).
const stableJson = (v: unknown): string => JSON.stringify(v, (_k, val) =>
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.keys(val).sort().reduce((o: any, k) => { o[k] = val[k]; return o; }, {})
    : val);
const shortLabel = (k: string) => k.split('-').reverse().slice(0, 2).map(Number).join('/');
// Atajos de fiestas: 24/12, 25/12, 31/12 y 1/1 de la temporada que viene (solo las que
// todavía no pasaron y caen dentro de los próximos 60 días).
function holidayShortcuts(todayKey: string): string[] {
  const now = nowInArgentina();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const limit = dateKey(addDaysWall(now, 60));
  return [`${y}-12-24`, `${y}-12-25`, `${y}-12-31`, `${y + 1}-01-01`].filter(k => k >= todayKey && k <= limit);
}

export default function EditStorePage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Estado para Horarios (por día, con franjas múltiples — ej: mañana/tarde)
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(defaultWeeklySchedule());

  // Horario especial por fecha (fiestas). `originalSpecialJson` = lo que había guardado,
  // para escribir el campo SOLO si cambió (o si hay fechas pasadas que limpiar).
  const [specialDays, setSpecialDays] = useState<SpecialDraft[]>([]);
  const [originalSpecialJson, setOriginalSpecialJson] = useState<string>('{}');
  const [hadSpecialHours, setHadSpecialHours] = useState(false);

  // Pausa manual: se guarda al toque (no espera a "Guardar Cambios") porque es una
  // acción de emergencia ("me quedé sin stock/personal"), no un dato de perfil.

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

          // Cargar Horarios (formato nuevo por día o el viejo {open,close}). Solo el SEMANAL:
          // normalizeSchedule además cuelga las fechas especiales, que se editan aparte.
          setWeeklySchedule(normalizeWeeklySchedule(data) || defaultWeeklySchedule());

          // Horario especial: las fechas pasadas no se muestran (se limpian al guardar).
          const special = normalizeSpecialHours(data.specialHours) || {};
          const todayKey = dateKey(nowInArgentina());
          setHadSpecialHours(data.specialHours !== undefined);
          setOriginalSpecialJson(stableJson(special));
          setSpecialDays(sortDrafts(Object.entries(special)
            .filter(([k]) => k >= todayKey)
            .map(([k, v]) => ({ id: newDraftId(), date: k, closed: v.closed, ranges: v.closed ? [] : v.ranges }))));

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

  // --- Edición de horarios por día ---
  const setDayClosed = (dayIdx: number, closed: boolean) => {
    setWeeklySchedule(prev => prev.map((d, i) => {
      if (i !== dayIdx) return d;
      // Al reabrir un día sin franjas, sembramos una por defecto para que no quede vacío.
      const ranges = !closed && d.ranges.length === 0 ? [{ open: '09:00', close: '22:00' }] : d.ranges;
      return { ...d, closed, ranges };
    }));
  };
  const updateRange = (dayIdx: number, rangeIdx: number, field: 'open' | 'close', value: string) => {
    setWeeklySchedule(prev => prev.map((d, i) =>
      i !== dayIdx ? d : { ...d, ranges: d.ranges.map((r, ri) => ri === rangeIdx ? { ...r, [field]: value } : r) }
    ));
  };
  const addRange = (dayIdx: number) => {
    setWeeklySchedule(prev => prev.map((d, i) =>
      i !== dayIdx ? d : { ...d, ranges: [...d.ranges, { open: '17:00', close: '21:00' }] }
    ));
  };
  const removeRange = (dayIdx: number, rangeIdx: number) => {
    setWeeklySchedule(prev => prev.map((d, i) =>
      i !== dayIdx ? d : { ...d, ranges: d.ranges.filter((_, ri) => ri !== rangeIdx) }
    ));
  };

  // --- Edición del horario especial por fecha ---
  const addSpecialDay = (date = '') => {
    setSpecialDays(prev => {
      if (prev.length >= MAX_SPECIAL_DAYS) return prev;
      if (date && prev.some(d => d.date === date)) return prev;
      return sortDrafts([...prev, { id: newDraftId(), date, closed: false, ranges: [{ open: '09:00', close: '20:00' }] }]);
    });
  };
  const updateSpecialDay = (id: string, patch: Partial<SpecialDraft>) => {
    setSpecialDays(prev => {
      const next = prev.map(d => {
        if (d.id !== id) return d;
        const merged = { ...d, ...patch };
        // Al reabrir un día sin franjas, sembramos una (igual que el editor semanal).
        if (patch.closed === false && merged.ranges.length === 0) merged.ranges = [{ open: '09:00', close: '20:00' }];
        return merged;
      });
      return 'date' in patch ? sortDrafts(next) : next;
    });
  };
  const updateSpecialRange = (id: string, ri: number, field: 'open' | 'close', value: string) => {
    setSpecialDays(prev => prev.map(d => d.id !== id ? d
      : { ...d, ranges: d.ranges.map((r, i) => i === ri ? { ...r, [field]: value } : r) }));
  };
  const addSpecialRange = (id: string) => {
    setSpecialDays(prev => prev.map(d => d.id !== id ? d
      : { ...d, ranges: [...d.ranges, { open: '17:00', close: '21:00' }] }));
  };
  const removeSpecialRange = (id: string, ri: number) => {
    setSpecialDays(prev => prev.map(d => d.id !== id ? d : { ...d, ranges: d.ranges.filter((_, i) => i !== ri) }));
  };
  const removeSpecialDay = (id: string) => setSpecialDays(prev => prev.filter(d => d.id !== id));

  // Link "Cargar horario de fiestas" (/my-store/edit#horario-especial): la página arranca
  // con un loader, así que el salto nativo al ancla no ocurre — lo hacemos al terminar de cargar.
  useEffect(() => {
    if (isLoading) return;
    if (typeof window === 'undefined' || window.location.hash !== '#horario-especial') return;
    const t = setTimeout(() => document.getElementById('horario-especial')?.scrollIntoView({ block: 'start' }), 50);
    return () => clearTimeout(t);
  }, [isLoading]);

  // ✅ GPS del dueño (Fase RR: captura compartida de geo.ts — timeout y mensajes por
  // tipo de error). Ya no es la ÚNICA forma de cargar la ubicación: el mapa con pin
  // ajustable de abajo permite marcarla a mano sin estar físicamente en el local.
  const handleGetLocation = async () => {
    setIsLocating(true);
    try {
        const position = await capturePosition();
        setCoords({ latitude: position.latitude, longitude: position.longitude });
        toast({ title: "¡Ubicación Detectada!", description: "Verificá el pin en el mapa y ajustalo si hace falta." });
    } catch (error: any) {
        console.error("Error GPS:", error);
        toast({ variant: "destructive", title: "Error GPS", description: error.message });
    } finally {
        setIsLocating(false);
    }
  };

  // 4. Guardar cambios
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !userProfile?.storeId || !user) return;

    // FE-R-002 (auditoría oct 2026): no había NINGUNA validación — se guardaban tiendas sin
    // nombre ni dirección (así salían en el home) y horarios con apertura > cierre (la tienda
    // quedaba cerrada todo el día sin que nadie supiera por qué).
    const name = (formData.name || '').trim();
    const addressText = (formData.address || '').trim();
    if (name.length < 3) {
        toast({ variant: "destructive", title: "Falta el nombre de la tienda", description: "Mínimo 3 caracteres." });
        return;
    }
    if (addressText.length < 5 || addressText.includes('Ubicación GPS')) {
        toast({ variant: "destructive", title: "Falta la dirección", description: "Escribí calle y número (ej: San Martín 500)." });
        return;
    }
    for (const [dayIdx, day] of weeklySchedule.entries()) {
        if (day.closed) continue;
        for (const r of day.ranges) {
            if (!r.open || !r.close || r.open >= r.close) {
                toast({
                    variant: "destructive",
                    title: `Horario inválido (${DAY_LABELS[dayIdx] ?? 'día'})`,
                    description: `La franja ${r.open || '—'} → ${r.close || '—'} no sirve: la hora de cierre tiene que ser posterior a la de apertura.`,
                });
                return;
            }
        }
    }

    // Horario especial: mismo criterio que el semanal (apertura < cierre) + fecha válida,
    // no pasada y sin repetir.
    const todayKey = dateKey(nowInArgentina());
    const specialError = validateSpecialDays(specialDays, todayKey);
    if (specialError) {
        toast({ variant: "destructive", title: "Horario especial inválido", description: specialError });
        document.getElementById('horario-especial')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
    }
    // Se escribe SOLO si cambió (o si había fechas pasadas que limpiar): una tienda que no
    // usa esta sección guarda exactamente los mismos campos que antes.
    const builtSpecial = buildSpecialHours(specialDays, todayKey);
    const specialUpdate: Record<string, unknown> =
        stableJson(builtSpecial) === originalSpecialJson ? {}
        : Object.keys(builtSpecial).length > 0 ? { specialHours: builtSpecial }
        : hadSpecialHours ? { specialHours: deleteField() }
        : {};

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

        weeklySchedule: weeklySchedule,
        // Espejo legacy {open,close} por si quedó algún lector viejo sin migrar (usa la
        // primera franja de un día abierto). normalizeSchedule igual prioriza weeklySchedule.
        schedule: legacyScheduleMirror(weeklySchedule),
        coords: coords,
        ...specialUpdate,

        updatedAt: new Date()
      });
      if ('specialHours' in specialUpdate) {
        setOriginalSpecialJson(stableJson(builtSpecial));
        setHadSpecialHours(Object.keys(builtSpecial).length > 0);
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

  if (authLoading || isLoading) {
    return <div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container max-w-3xl mx-auto space-y-6 pb-20">
      <PageHeader
        title="Editar Mi Tienda"
        description="Gestiona la apariencia y datos de tu negocio."
      />

      {/* Pausa con tiempo (Fase YY): mismo componente que el dashboard /my-store */}
      <StorePauseControl storeId={userProfile?.storeId} />

      {/* SECCIÓN 1: DATOS DEL NEGOCIO */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StoreIcon className="h-5 w-5" /> Datos del negocio
          </CardTitle>
          <CardDescription>
            Lo que ven los clientes en la app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Portada de la Tienda</Label>
            <div className="flex justify-center">
                <ImageUpload
                    currentImageUrl={formData.imageUrl}
                    onImageUploaded={handleImageUploaded}
                    folder="store-banners"
                    // uid del dueño, no storeId: storage.rules valida esta carpeta con el
                    // mismo patrón simple que profiles/licenses (uid propio == path), sin
                    // lookup cruzado a Firestore (ver Fase BB: firestore.get() no funciona
                    // de forma confiable desde Storage Rules en este proyecto).
                    ownerId={user!.uid}
                    variant="banner"
                />
            </div>
            <p className="text-[0.8rem] text-muted-foreground text-center">
                Se recomienda una imagen horizontal de buena calidad.
            </p>
          </div>

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

          <div className="space-y-2">
            <Label htmlFor="category">Rubro / Categoría de la tienda</Label>
            <Select value={formData.category} onValueChange={(val) => setFormData(prev => ({ ...prev, category: val }))}>
                <SelectTrigger id="category">
                    <SelectValue placeholder="Elegí tu rubro" />
                </SelectTrigger>
                <SelectContent>
                    {/* Incluye el rubro actual si es uno viejo que no está en la lista canónica,
                        para no perderlo silenciosamente al abrir el form. */}
                    {formData.category && !STORE_CATEGORIES.includes(formData.category as any) && (
                        <SelectItem value={formData.category}>{formData.category} (actual)</SelectItem>
                    )}
                    {STORE_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p className="text-[0.8rem] text-muted-foreground">
                Con esto los clientes te filtran desde la pantalla de inicio.
            </p>
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
        </CardContent>
      </Card>

      {/* SECCIÓN 2: UBICACIÓN */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" /> Ubicación
          </CardTitle>
          <CardDescription>
            La dirección visible + el GPS que usa el mapa de seguimiento del repartidor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="address">Dirección del Local</Label>
            <div className="flex gap-2">
                <Input
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Calle, Número y Barrio (Texto visible)"
                    className="flex-1"
                />
                <Button
                    type="button"
                    variant={coords ? "default" : "outline"}
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
            {coords ? (
                <div className="flex justify-between items-center text-xs">
                    <span className="text-success flex items-center gap-1 font-medium">
                        <MapPin className="h-3 w-3"/> Mapa configurado correctamente
                    </span>
                    <span className="text-muted-foreground text-xs">
                        Lat: {coords.latitude.toFixed(4)}, Lng: {coords.longitude.toFixed(4)}
                    </span>
                </div>
            ) : (
                <p className="text-xs text-warning flex items-center gap-1 font-medium">
                    <AlertTriangle className="h-3 w-3"/> Importante: marcá tu local en el mapa (o usá el botón GPS si estás en el local).
                </p>
            )}

            {/* PIN AJUSTABLE (Fase RR): antes la ÚNICA forma de cargar la ubicación era
                el GPS del dueño parado en el local. Ahora puede marcar/corregir el punto
                tocando el mapa o arrastrando el pin, desde cualquier lado. */}
            <LocationPicker
                value={coords}
                onChange={(c) => setCoords({ latitude: c.latitude, longitude: c.longitude })}
                className="h-56"
                hint={coords
                    ? 'Arrastrá el pin hasta la entrada de tu local: ahí va a llegar el repartidor.'
                    : 'Tocá el mapa donde está tu local para colocar el pin.'}
            />
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN 3: HORARIOS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Horarios de atención
          </CardTitle>
          <CardDescription>
            Podés cargar más de una franja por día (ej: mañana y tarde) o marcar un día como cerrado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {DISPLAY_ORDER.map((dayIdx) => {
            const day = weeklySchedule[dayIdx];
            return (
                <div key={dayIdx} className="border rounded-md p-3 bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{DAY_LABELS[dayIdx]}</span>
                        <div className="flex items-center gap-2">
                            <span className={`text-xs ${day.closed ? 'text-muted-foreground' : 'text-success'}`}>
                                {day.closed ? 'Cerrado' : 'Abierto'}
                            </span>
                            <Switch checked={!day.closed} onCheckedChange={(v) => setDayClosed(dayIdx, !v)} />
                        </div>
                    </div>

                    {!day.closed && (
                        <div className="space-y-2">
                            {day.ranges.map((r, ri) => (
                                <div key={ri} className="flex items-center gap-2">
                                    <Input
                                        type="time"
                                        value={r.open}
                                        onChange={(e) => updateRange(dayIdx, ri, 'open', e.target.value)}
                                        className="w-32"
                                    />
                                    <span className="text-muted-foreground text-sm">a</span>
                                    <Input
                                        type="time"
                                        value={r.close}
                                        onChange={(e) => updateRange(dayIdx, ri, 'close', e.target.value)}
                                        className="w-32"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="text-muted-foreground hover:text-destructive"
                                        onClick={() => removeRange(dayIdx, ri)}
                                        title="Quitar franja"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={() => addRange(dayIdx)}>
                                <Plus className="mr-2 h-3 w-3" /> Agregar franja
                            </Button>
                        </div>
                    )}
                </div>
            );
          })}
        </CardContent>
      </Card>

      {/* SECCIÓN 3 bis: HORARIO ESPECIAL POR FECHA (fiestas). Ese día pisa al semanal. */}
      <Card id="horario-especial" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Horario especial
          </CardTitle>
          <CardDescription>
            Para fechas puntuales (24/12, 31/12, feriados): ese día manda este horario en vez del semanal, y tus clientes ven hasta qué hora pueden pedir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(() => {
            const todayKey = dateKey(nowInArgentina());
            const shortcuts = holidayShortcuts(todayKey).filter(k => !specialDays.some(d => d.date === k));
            const full = specialDays.length >= MAX_SPECIAL_DAYS;
            return (
              <>
                {specialDays.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No cargaste ninguna fecha. Sin fechas especiales, rige el horario semanal de arriba.
                  </p>
                )}

                {specialDays.map((d) => {
                  const pastOrInvalid = !!d.date && (!isValidDateKey(d.date) || d.date < todayKey);
                  const duplicated = !!d.date && specialDays.filter(x => x.date === d.date).length > 1;
                  return (
                    <div key={d.id} data-testid="special-day" className="space-y-3 rounded-md border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`sd-date-${d.id}`} className="sr-only">Fecha</Label>
                          <Input
                            id={`sd-date-${d.id}`}
                            type="date"
                            min={todayKey}
                            value={d.date}
                            onChange={(e) => updateSpecialDay(d.id, { date: e.target.value })}
                            aria-invalid={pastOrInvalid || duplicated || !d.date}
                            className={`w-44 ${pastOrInvalid || duplicated ? 'border-destructive' : ''}`}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${d.closed ? 'text-muted-foreground' : 'text-success'}`}>
                            {d.closed ? 'Cerrado' : 'Abierto'}
                          </span>
                          <Switch
                            checked={!d.closed}
                            onCheckedChange={(v) => updateSpecialDay(d.id, { closed: !v })}
                            aria-label={`${d.date ? shortLabel(d.date) : 'Fecha nueva'}: abierto`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeSpecialDay(d.id)}
                            aria-label={`Quitar ${d.date ? shortLabel(d.date) : 'esta fecha'}`}
                            title="Quitar fecha"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {(pastOrInvalid || duplicated) && (
                        <p className="text-xs text-destructive">
                          {duplicated ? 'Esta fecha está cargada dos veces.' : 'Esa fecha ya pasó: elegí otra o quitala.'}
                        </p>
                      )}

                      {!d.closed && (
                        <div className="space-y-2">
                          {d.ranges.map((r, ri) => {
                            const bad = !!r.open && !!r.close && r.open >= r.close;
                            return (
                              <div key={ri} className="flex items-center gap-2">
                                <Input
                                  type="time"
                                  value={r.open}
                                  onChange={(e) => updateSpecialRange(d.id, ri, 'open', e.target.value)}
                                  aria-label="Abre"
                                  aria-invalid={bad}
                                  className={`w-32 ${bad ? 'border-destructive' : ''}`}
                                />
                                <span className="text-muted-foreground text-sm">a</span>
                                <Input
                                  type="time"
                                  value={r.close}
                                  onChange={(e) => updateSpecialRange(d.id, ri, 'close', e.target.value)}
                                  aria-label="Cierra"
                                  aria-invalid={bad}
                                  className={`w-32 ${bad ? 'border-destructive' : ''}`}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => removeSpecialRange(d.id, ri)}
                                  aria-label="Quitar franja"
                                  title="Quitar franja"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                          {d.ranges.some(r => r.open && r.close && r.open >= r.close) && (
                            <p className="text-xs text-destructive">La hora de cierre tiene que ser posterior a la de apertura.</p>
                          )}
                          <Button type="button" variant="outline" size="sm" onClick={() => addSpecialRange(d.id)}>
                            <Plus className="mr-2 h-3 w-3" /> Agregar franja
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => addSpecialDay()} disabled={full}>
                    <Plus className="mr-2 h-3 w-3" /> Agregar fecha
                  </Button>
                  {shortcuts.map(k => (
                    <Button
                      key={k}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => addSpecialDay(k)}
                      disabled={full}
                      data-testid={`special-shortcut-${k}`}
                    >
                      <Plus className="mr-1 h-3 w-3" /> {shortLabel(k)}
                    </Button>
                  ))}
                </div>
                {full && (
                  <p className="text-xs text-muted-foreground">Llegaste al máximo de {MAX_SPECIAL_DAYS} fechas. Quitá alguna para sumar otra.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Las fechas que ya pasaron se borran solas al guardar.
                </p>
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* SECCIÓN 4: ENTREGA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> Entrega
          </CardTitle>
        </CardHeader>
        <CardContent>
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
      </Card>

      {/* Barra de guardado fija: siempre a mano en un form largo (el rol tienda no tiene
          bottom-nav, así que no se pisa con nada). */}
      <div className="sticky bottom-0 z-20 -mx-4 sm:mx-0 flex justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 rounded-b-lg">
        <Button variant="ghost" onClick={() => router.push('/my-store')}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="mr-2 h-4 w-4" /> Guardar Cambios</>}
        </Button>
      </div>
    </div>
  );
}
