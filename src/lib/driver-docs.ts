// Fuente ÚNICA de "tipo de vehículo" y "documentos obligatorios" del repartidor
// (FE-R-003, auditoría oct 2026). Antes el alta (`/signup/delivery`) guardaba
// 'motocicleta' | 'automovil' | 'bicicleta' y el Perfil ofrecía 'Moto' | 'Bici' | 'Auto':
// todo repartidor registrado veía el Select vacío y, si tocaba Guardar, el tipo se pisaba
// con 'Moto' — desincronizando el dato que decide qué documentos se exigen (Fase PP) y lo
// que ve el admin. Alta, Perfil y admin tienen que leer de acá.

export type VehicleType = 'motocicleta' | 'automovil' | 'bicicleta';

export const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'motocicleta', label: 'Moto' },
  { value: 'automovil', label: 'Auto' },
  { value: 'bicicleta', label: 'Bicicleta' },
];

// Valores que escribió el Perfil viejo (y el seed) → canónicos.
const LEGACY: Record<string, VehicleType> = {
  Moto: 'motocicleta', moto: 'motocicleta', Motocicleta: 'motocicleta',
  Auto: 'automovil', auto: 'automovil', Automovil: 'automovil', automóvil: 'automovil',
  Bici: 'bicicleta', bici: 'bicicleta', Bicicleta: 'bicicleta',
};

export function normalizeVehicleType(v: unknown): VehicleType {
  if (typeof v !== 'string') return 'motocicleta';
  if (v === 'motocicleta' || v === 'automovil' || v === 'bicicleta') return v;
  return LEGACY[v] ?? 'motocicleta';
}

export const vehicleLabel = (v: unknown) => VEHICLE_TYPES.find(t => t.value === normalizeVehicleType(v))?.label ?? 'Moto';

export const isBikeType = (v: unknown) => normalizeVehicleType(v) === 'bicicleta';

// Documentos requeridos según el vehículo. Los campos de licencia se reusan para el DNI
// cuando es bicicleta (no necesita licencia de conducir) — el rótulo cambia, el campo no.
export type DocField = { key: 'licenseUrl' | 'licenseBackUrl' | 'licenseSelfieUrl' | 'vehicleDocUrl' | 'vehicleInsuranceUrl'; label: string };
export const DOC_FIELDS = (isBike: boolean): DocField[] => [
  { key: 'licenseUrl', label: isBike ? 'DNI — frente' : 'Licencia de conducir — frente' },
  { key: 'licenseBackUrl', label: isBike ? 'DNI — dorso' : 'Licencia de conducir — dorso' },
  { key: 'licenseSelfieUrl', label: isBike ? 'Selfie sosteniendo tu DNI' : 'Selfie sosteniendo tu licencia' },
  ...(isBike ? [] : [
    { key: 'vehicleDocUrl' as const, label: 'Cédula / papeles del vehículo' },
    { key: 'vehicleInsuranceUrl' as const, label: 'Seguro del vehículo vigente' },
  ]),
];
