// Estilo visual consistente para los estados del pedido, reutilizable por las
// vistas de cliente, tienda y repartidor. Centraliza el mapeo estado -> color
// semantico para que un mismo estado se vea igual en toda la app.

export type OrderStatusKind = 'success' | 'info' | 'warning' | 'destructive' | 'neutral';

export function getOrderStatusKind(status: string | undefined): OrderStatusKind {
  const s = status?.toLowerCase() || '';
  if (s.includes('entregado')) return 'success';
  if (s.includes('reparto') || s.includes('camino')) return 'info';
  if (s.includes('preparaci') || s.includes('cocina') || s.includes('listo')) return 'warning';
  if (s.includes('cancelado') || s.includes('rechazado')) return 'destructive';
  return 'neutral'; // pendiente / por pagar
}

// Clases para un badge suave (fondo translúcido + texto + borde) según el estado.
export const orderStatusBadgeClass: Record<OrderStatusKind, string> = {
  success: 'bg-success/15 text-success border-success/30',
  info: 'bg-info/15 text-info border-info/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  destructive: 'bg-destructive/15 text-destructive border-destructive/30',
  neutral: 'bg-muted text-muted-foreground border-border',
};

// Color de texto/ícono según el estado.
export const orderStatusTextClass: Record<OrderStatusKind, string> = {
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  destructive: 'text-destructive',
  neutral: 'text-muted-foreground',
};
