// Motivos de discrepancia de pago (payment_mismatches) — etiquetas y qué hacer con cada uno.
// Compartido entre /admin/payment-issues, la Bandeja y el Resumen (Tanda T1): antes el
// dashboard tenía su propio mapeo de 2 entradas y rotulaba 5 de los 7 motivos como
// "Estado de orden inesperado".
export const REASON_LABELS: Record<string, string> = {
  amount_mismatch: 'Monto no coincide',
  unexpected_order_status: 'Estado de orden inesperado',
  // Anomalías que antes no dejaban ningún registro (ver webhook y /api/orders/cancel).
  payment_reversed: 'Pago revertido en MercadoPago',
  duplicate_payment: 'Doble pago del mismo pedido',
  cancelled_after_payment: 'Cancelado con el pago hecho',
  // Detectadas por la conciliación (src/lib/reconcile-mp.ts, Fase NN bis).
  reconcile_mismatch: 'MP no confirma este pago',
  orphan_payment: 'Pago sin pedido',
};

// Qué tiene que hacer el admin con cada tipo. Sin esto, "marcar resuelto" es un botón que
// hace desaparecer una alerta de plata sin que quede claro qué acción correspondía.
export const REASON_HINTS: Record<string, string> = {
  amount_mismatch: 'Verificá en MercadoPago cuánto entró realmente y ajustá o reembolsá la diferencia.',
  unexpected_order_status: 'El pago llegó tarde. Decidí si reactivás el pedido o devolvés la plata.',
  payment_reversed: 'MercadoPago devolvió o retuvo esta plata. Si el pedido se entregó, es una pérdida a registrar.',
  duplicate_payment: 'El comprador pagó dos veces. Hay que devolverle uno de los dos pagos.',
  cancelled_after_payment: 'El pedido se canceló con la plata ya cobrada: corresponde reembolsar al comprador.',
  reconcile_mismatch: 'La orden figura pagada acá pero MP no muestra ese pago como aprobado. Verificá el pago en el panel de MP antes de entregar o liquidar.',
  orphan_payment: 'Entró plata en MP con una referencia de pedido que no existe en el sistema. Buscá el pago en MP y devolvelo si no corresponde.',
};

export function reasonLabel(reason: string | undefined | null): string {
  return (reason && REASON_LABELS[reason]) || reason || 'Discrepancia de pago';
}
