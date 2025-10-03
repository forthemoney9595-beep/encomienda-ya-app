'use server';
import type { Store, Product, DeliveryPersonnel } from './placeholder-data';
import { initialPrototypeStores, prototypeDelivery } from './placeholder-data';

/**
 * Fetches stores. In prototype mode, this is a placeholder.
 * @param all - If true, fetches all stores regardless of status.
 */
export async function getStores(all: boolean = false): Promise<Store[]> {
  console.warn("getStores is a placeholder in prototype mode.");
  return [];
}


/**
 * Fetches a single store by its ID. In prototype mode, this is a placeholder.
 * @param id The ID of the store to fetch.
 */
export async function getStoreById(id: string): Promise<Store | null> {
    console.warn("getStoreById is a placeholder in prototype mode.");
    return null;
}

/**
 * Fetches all products for a given store ID. In prototype mode, this is a placeholder.
 * @param storeId The ID of the store whose products to fetch.
 */
export async function getProductsByStoreId(storeId: string): Promise<Product[]> {
  console.warn("getProductsByStoreId is a placeholder in prototype mode.");
  return [];
}

/**
 * Adds a new product to a store. In prototype mode, this is a placeholder.
 * @param storeId The ID of the store.
 * @param productData The data for the new product.
 * @param currentCategories The current list of categories for the store.
 */
export async function addProductToStore(storeId: string, productData: Product, currentCategories: string[]): Promise<void> {
    console.warn("addProductToStore is a placeholder in prototype mode.");
    return;
}

export async function updateProductInStore(storeId: string, productId: string, productData: Partial<Product>) {
    console.warn("updateProductInStore is a placeholder in prototype mode.");
    return;
}

export async function deleteProductFromStore(storeId: string, productId: string) {
    console.warn("deleteProductFromStore is a placeholder in prototype mode.");
    return;
}

/**
 * Fetches all delivery personnel. In prototype mode, returns a mix of real and proto data.
 */
export async function getDeliveryPersonnel(isPrototype: boolean = false): Promise<DeliveryPersonnel[]> {
  console.warn("getDeliveryPersonnel is a placeholder in prototype mode.");
  if(isPrototype) {
    return [prototypeDelivery];
  }
  return [];
}

/**
 * Fetches a single delivery person by their user ID. In prototype mode, this is a placeholder.
 */
export async function getDeliveryPersonById(id: string): Promise<(DeliveryPersonnel & { email: string }) | null> {
  console.warn("getDeliveryPersonById is a placeholder in prototype mode.");
  if (id === prototypeDelivery.id) {
    return prototypeDelivery;
  }
  return null;
}

/**
 * Updates the status of a store. In prototype mode, this is a placeholder.
 * @param storeId The ID of the store to update.
 * @param status The new status ('Aprobado' or 'Rechazado').
 */
export async function updateStoreStatus(storeId: string, status: 'Aprobado' | 'Rechazado'): Promise<void> {
  console.warn("updateStoreStatus is a placeholder in prototype mode.");
  return;
}

/**
 * Updates store data. In prototype mode, this is a placeholder.
 * @param storeId The ID of the store to update.
 * @param storeData The data to update.
 */
export async function updateStoreData(storeId: string, storeData: Partial<Store>): Promise<void> {
    console.warn("updateStoreData is a placeholder in prototype mode.");
    return;
}


/**
 * Updates the status of a delivery person. In prototype mode, this is a placeholder.
 * @param personnelId The ID of the delivery person to update.
 * @param status The new status ('approved' or 'rejected').
 */
export async function updateDeliveryPersonnelStatus(personnelId: string, status: 'approved' | 'rejected'): Promise<void> {
  console.warn("updateDeliveryPersonnelStatus is a placeholder in prototype mode.");
  return;
}
