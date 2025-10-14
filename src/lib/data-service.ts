
'use server';
import type { Store, Product, DeliveryPersonnel } from './placeholder-data';
import { Firestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

/**
 * Fetches a single store by its ID. In prototype mode, this is a placeholder.
 * @param id The ID of the store to fetch.
 */
export async function getStoreById(db: Firestore, id: string): Promise<Store | null> {
    const storeRef = doc(db, 'stores', id);
    const storeSnap = await getDoc(storeRef);
    if (storeSnap.exists()) {
        return { ...storeSnap.data(), id: storeSnap.id } as Store;
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
 * Fetches a single delivery person by their user ID. In prototype mode, this is a placeholder.
 */
export async function getDeliveryPersonById(db: Firestore, id: string): Promise<(DeliveryPersonnel & { email: string }) | null> {
    const userRef = doc(db, 'users', id);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists() && userSnap.data().role === 'delivery') {
        return { ...userSnap.data(), id: userSnap.id } as DeliveryPersonnel & { email: string };
    }
    return null;
}

/**
 * Updates the status of a store.
 * @param db The Firestore instance.
 * @param storeId The ID of the store to update.
 * @param status The new status ('Aprobado' or 'Rechazado').
 */
export async function updateStoreStatus(db: Firestore, storeId: string, status: 'Aprobado' | 'Rechazado'): Promise<void> {
  const storeRef = doc(db, 'stores', storeId);
  await updateDoc(storeRef, { status });
}

/**
 * Updates the status of a delivery person.
 * @param db The Firestore instance.
 * @param personnelId The UID of the delivery person to update.
 * @param status The new status ('Activo' or 'Rechazado').
 */
export async function updateDeliveryPersonnelStatus(db: Firestore, personnelId: string, status: 'Activo' | 'Rechazado'): Promise<void> {
  const userRef = doc(db, 'users', personnelId);
  await updateDoc(userRef, { status });
}

    