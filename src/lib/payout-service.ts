import { adminDb } from '@/lib/firebase-admin';

// Fórmula centralizada de saldo disponible — reemplaza el cálculo duplicado que vivía
// por separado en my-store/wallet/page.tsx y delivery/earnings/page.tsx, y ahora también
// se usa server-side en /api/admin/approve-withdrawal para validar antes de aprobar.

export async function computeStoreBalance(storeId: string): Promise<{
  totalRevenue: number;
  totalWithdrawn: number;
  availableBalance: number;
  commissionRate: number;
}> {
  const storeSnap = await adminDb.collection('stores').doc(storeId).get();
  const commissionRate: number = storeSnap.data()?.commissionRate || 0;

  const ordersSnap = await adminDb.collection('orders')
    .where('storeId', '==', storeId)
    .where('status', '==', 'Entregado')
    .get();

  const totalRevenue = ordersSnap.docs.reduce((sum, d) => {
    const o = d.data();
    const productTotal = (o.total || 0) - (o.deliveryFee || 0);
    const commission = productTotal * (commissionRate / 100);
    return sum + Math.max(0, productTotal - commission);
  }, 0);

  const ownerId = storeSnap.data()?.ownerId;
  if (!ownerId) return { totalRevenue, totalWithdrawn: 0, availableBalance: totalRevenue, commissionRate };

  const withdrawalsSnap = await adminDb.collection('withdrawals')
    .where('userId', '==', ownerId)
    .where('userRole', '==', 'store')
    .get();

  const totalWithdrawn = withdrawalsSnap.docs
    .filter(d => d.data().status !== 'rejected')
    .reduce((sum, d) => sum + (d.data().amount || 0), 0);

  return {
    totalRevenue,
    totalWithdrawn,
    availableBalance: Math.max(0, totalRevenue - totalWithdrawn),
    commissionRate,
  };
}

export async function computeDriverBalance(driverUserId: string): Promise<{
  totalEarned: number;
  totalWithdrawn: number;
  availableBalance: number;
}> {
  const ordersSnap = await adminDb.collection('orders')
    .where('deliveryPersonId', '==', driverUserId)
    .where('status', '==', 'Entregado')
    .get();

  const totalEarned = ordersSnap.docs.reduce((sum, d) => sum + (d.data().deliveryFee || 0), 0);

  const withdrawalsSnap = await adminDb.collection('withdrawals')
    .where('userId', '==', driverUserId)
    .where('userRole', '==', 'delivery')
    .get();

  const totalWithdrawn = withdrawalsSnap.docs
    .filter(d => d.data().status !== 'rejected')
    .reduce((sum, d) => sum + (d.data().amount || 0), 0);

  return {
    totalEarned,
    totalWithdrawn,
    availableBalance: Math.max(0, totalEarned - totalWithdrawn),
  };
}
