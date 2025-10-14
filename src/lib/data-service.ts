
'use server';
import type { Store, Product, DeliveryPersonnel } from './placeholder-data';
import { initialPrototypeStores, prototypeDelivery } from './placeholder-data';
import { Firestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

/**
 * Fetches a single store by its ID. In prototype mode, this is a placeholder.
 * @param id The ID of the store to fetch.
 */
export async function getStoreById(db: Firestore, id: string): Promise<Store | null> {
    const storeRef = doc(db, 'stores', id);
    const storeSnap = await getDoc(storeRef);
    if (storeSnap.exists()) {
        return storeSnap.data() as Store;
    }
    return null;
}


/**
 * Adds a new product to a store. This is a non-blocking operation.
 * @param db The Firestore instance.
 * @param storeId The ID of the store.
 * @param productData The data for the new product.
 */
export async function addProductToStore(db: Firestore, storeId: string, productData: Product): Promise<void> {
    const storeRef = doc(db, 'stores', storeId);
    await updateDoc(storeRef, {
        products: arrayUnion(productData)
    });
}

export async function updateProductInStore(db: Firestore, storeId: string, productId: string, productData: Partial<Product>) {
    const store = await getStoreById(db, storeId);
    if (!store || !store.products) return;

    const productIndex = store.products.findIndex(p => p.id === productId);
    if (productIndex === -1) return;

    const updatedProducts = [...store.products];
    updatedProducts[productIndex] = { ...updatedProducts[productIndex], ...productData };

    const storeRef = doc(db, 'stores', storeId);
    await updateDoc(storeRef, { products: updatedProducts });
}

export async function deleteProductFromStore(db: Firestore, storeId: string, productId: string) {
    const store = await getStoreById(db, storeId);
    if (!store || !store.products) return;

    const productToDelete = store.products.find(p => p.id === productId);
    if (!productToDelete) return;
    
    const storeRef = doc(db, 'stores', storeId);
    await updateDoc(storeRef, {
        products: arrayRemove(productToDelete)
    });
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

    