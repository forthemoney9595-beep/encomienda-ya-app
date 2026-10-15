// Formato ÚNICO de plata para la UI (auditoría oct 2026: ARQ-017 / FE-C-019 / FE-R-005).
// Antes convivían `toFixed(2)` ("$5200.00", sin miles y con el punto donde va la coma),
// `toLocaleString()` sin locale (en-US en Vercel/PC: "1,059.524") y montos crudos
// ("$1059.5238095238095"). Siempre es-AR, redondeado a peso: en Argentina no se cobran
// centavos y "1.059,524" se lee como un millón.
export function money(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0';
  return '$' + Math.round(v).toLocaleString('es-AR');
}

// Variante con signo explícito para movimientos (+$2.000 / -$500).
export function signedMoney(n: number): string {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-' : '+') + money(Math.abs(v));
}
