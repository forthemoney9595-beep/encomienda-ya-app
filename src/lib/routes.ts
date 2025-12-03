export const ROUTES = {
  home: '/',
  login: '/login',
  signup: '/signup',
  
  // Cliente
  orders: '/orders', // La central de "Mis Pedidos"
  favorites: '/favorites',
  profile: '/profile',
  
  // Tienda
  myStore: '/my-store',
  storeProducts: '/my-store/products',
  storeOrders: '/my-store/orders',
  
  // Repartidor
  deliveryDashboard: '/delivery/dashboard',
  deliveryEarnings: '/delivery/earnings',
  
  // Admin
  adminDashboard: '/admin/dashboard',
};

/**
 * Función auxiliar para navegar a una tienda específica
 */
export const getStoreRoute = (storeId: string) => `/stores/${storeId}`;