// Nombre "público" al estándar Rappi/PedidosYa: nombre de pila + inicial del apellido.
//   publicName('María García')      → 'María G.'
//   publicName('juan')              → 'juan'
//   publicName('')                  → 'Cliente'
// Puro (sin Firestore), importable por cliente y servidor. Usado en reseñas públicas y
// en el "Tu repartidor: X" del seguimiento (auditoría de privacidad, ago 2026).
export function publicName(fullName?: string | null, fallback = 'Cliente'): string {
  const clean = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!clean) return fallback;
  const parts = clean.split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}
