
'use server';
import { db } from './firebase';
import { collection, getDocs, query, doc, getDoc, where, updateDoc, addDoc, serverTimestamp, Timestamp, arrayUnion, deleteDoc, setDoc } from 'firebase/firestore';
import type { Store, Product, DeliveryPersonnel, prototypeUsers } from './placeholder-data';
import { 
    prototypeStore, 
    getPrototypeProducts, 
} from './placeholder-data';


/**
 * Fetches stores from Firestore.
 * @param all - If true, fetches all stores regardless of status. Otherwise, fetches only 'Aprobado' stores.
 * @param isPrototype - If true, ensures prototype data is included.
 */
export async function getStores(all: boolean = false, isPrototype: boolean = false): Promise<Store[]> {
  let stores: Store[] = [];
  try {
    const storesCollectionRef = collection(db, 'stores');
    const q = all ? query(storesCollectionRef) : query(storesCollectionRef, where("status", "==", "Aprobado"));
    
    const querySnapshot = await getDocs(q);
    
    stores = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        category: data.category || '',
        address: data.address || '',
        imageUrl: data.imageUrl || 'https://picsum.photos/seed/placeholder/600/400',
        imageHint: data.imageHint || 'store',
        status: data.status || 'Pendiente',
        ownerId: data.ownerId || '',
        productCategories: data.productCategories || [data.category] || [],
      };
    });

  } catch (error) {
    console.error("Error fetching stores from Firestore: ", error);
    // If fetching fails, we can still proceed with prototype data if requested.
  }

  if (isPrototype) {
    // Ensure prototype store is included and not duplicated
    if (!stores.find(s => s.id === prototypeStore.id)) {
        stores.unshift(prototypeStore);
    }
  }
  
  return stores;
}


/**
 * Fetches a single store by its ID from Firestore.
 * @param id The ID of the store to fetch.
 */
export async function getStoreById(id: string): Promise<Store | null> {
  if (id.startsWith('proto-')) {
    return prototypeStore;
  }

  try {
    const docRef = doc(db, "stores", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return { 
        id: docSnap.id,
        name: data.name || '',
        category: data.category || '',
        address: data.address || '',
        imageUrl: data.imageUrl || 'https://picsum.photos/seed/placeholder/600/400',
        imageHint: data.imageHint || 'store',
        status: data.status || 'Pendiente',
        ownerId: data.ownerId || '',
        productCategories: data.productCategories || [data.category] || [],
      } as Store;
    } else {
      console.log(`No store found with id: ${id}`);
      return null;
    }
  } catch (error) {
    console.error("Error fetching store:", error);
    return null;
  }
}

/**
 * Fetches all products for a given store ID from its 'products' subcollection in Firestore.
 * @param storeId The ID of the store whose products to fetch.
 */
export async function getProductsByStoreId(storeId: string): Promise<Product[]> {
  if (storeId.startsWith('proto-')) {
    return getPrototypeProducts();
  }

  try {
    const productsCollectionRef = collection(db, 'stores', storeId, 'products');
    const q = query(productsCollectionRef);
    const querySnapshot = await getDocs(q);

    const products: Product[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        description: data.description || '',
        price: data.price || 0,
        category: data.category || '',
        imageUrl: data.imageUrl,
      };
    });

    return products;
  } catch (error) {
    console.error(`Error fetching products for store ${storeId}:`, error);
    return [];
  }
}

/**
 * Adds a new product to a store's 'products' subcollection.
 * If the product's category is new, it adds it to the store's `productCategories` array.
 * @param storeId The ID of the store.
 * @param productData The data for the new product.
 * @param currentCategories The current list of categories for the store.
 */
export async function addProductToStore(storeId: string, productData: Product, currentCategories: string[]): Promise<void> {
    if (storeId.startsWith('proto-')) {
      console.log("Prototype mode: Add handled in-memory.");
      return;
    }
    try {
        const storeRef = doc(db, 'stores', storeId);
        const productRef = doc(collection(storeRef, 'products'), productData.id);
        
        await setDoc(productRef, productData);

        // Check if the category is new and update the store document
        if (!currentCategories.map((c: string) => c.toLowerCase()).includes(productData.category.toLowerCase())) {
            await updateDoc(storeRef, {
                productCategories: arrayUnion(productData.category)
            });
        }
    } catch (error) {
        console.error(`Error adding product to store ${storeId}:`, error);
        throw error;
    }
}

export async function updateProductInStore(storeId: string, productId: string, productData: Partial<Product>) {
    if (storeId.startsWith('proto-')) {
        console.log("Prototype mode: Update handled in-memory.");
        return;
    }

    try {
        const productRef = doc(db, 'stores', storeId, 'products', productId);
        await updateDoc(productRef, productData);
    } catch (error) {
        console.error(`Error updating product ${productId} in store ${storeId}:`, error);
        throw error;
    }
}

export async function deleteProductFromStore(storeId: string, productId: string) {
    if (storeId.startsWith('proto-')) {
        console.log("Prototype mode: Delete handled in-memory.");
        return;
    }

    try {
        const productRef = doc(db, 'stores', storeId, 'products', productId);
        await deleteDoc(productRef);
    } catch (error) {
        console.error(`Error deleting product ${productId} from store ${storeId}:`, error);
        throw error;
    }
}


/**
 * Fetches all delivery personnel from the 'users' collection in Firestore.
 */
export async function getDeliveryPersonnel(isPrototype: boolean = false): Promise<DeliveryPersonnel[]> {
  const { prototypeUsers } = await import('./placeholder-data');
  try {
    const usersCollectionRef = collection(db, 'users');
    const q = query(usersCollectionRef, where('role', '==', 'delivery'));
    const querySnapshot = await getDocs(q);
    
    const personnel: DeliveryPersonnel[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      const statusMap = {
        'pending': 'Pendiente',
        'approved': 'Activo',
        'rejected': 'Rechazado',
      }
      return {
        id: doc.id,
        name: data.name || '',
        vehicle: data.vehicle || 'No especificado',
        zone: data.zone || 'No asignada',
        status: statusMap[data.status as keyof typeof statusMap] || 'Inactivo',
        email: data.email || '',
      };
    });

    if (isPrototype) {
        const protoDeliveryUser = Object.values(prototypeUsers).find(u => u.role === 'delivery');
        if (protoDeliveryUser && !personnel.find(p => p.id === protoDeliveryUser.uid)) {
            personnel.unshift({
                id: protoDeliveryUser.uid,
                name: protoDeliveryUser.name,
                status: 'Activo',
                vehicle: 'Motocicleta',
                zone: 'Centro',
                email: protoDeliveryUser.email,
            });
        }
    }
    
    return personnel;
  } catch (error) {
    console.error("Error fetching delivery personnel from Firestore: ", error);
    if (isPrototype) {
        const protoDeliveryUser = Object.values(prototypeUsers).find(u => u.role === 'delivery');
        if (protoDeliveryUser) {
            return [{
                id: protoDeliveryUser.uid,
                name: protoDeliveryUser.name,
                status: 'Activo',
                vehicle: 'Motocicleta',
                zone: 'Centro',
                email: protoDeliveryUser.email,
            }];
        }
    }
    return [];
  }
}

/**
 * Fetches a single delivery person by their user ID.
 */
export async function getDeliveryPersonById(id: string): Promise<(DeliveryPersonnel & { email: string }) | null> {
  const { prototypeUsers } = await import('./placeholder-data');
  // Check prototype users first
  const protoUser = Object.values(prototypeUsers).find(u => u.uid === id && u.role === 'delivery');
  if (protoUser) {
      return {
          id: protoUser.uid,
          name: protoUser.name,
          email: protoUser.email,
          vehicle: 'Motocicleta',
          zone: 'Centro',
          status: 'Activo'
      };
  }

  try {
    const docRef = doc(db, "users", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().role === 'delivery') {
      const data = docSnap.data();
      const statusMap = {
        'pending': 'Pendiente',
        'approved': 'Activo',
        'rejected': 'Rechazado',
      }
      return { 
        id: docSnap.id,
        name: data.name || '',
        email: data.email || '',
        vehicle: data.vehicle || 'No especificado',
        zone: data.zone || 'No asignada',
        status: statusMap[data.status as keyof typeof statusMap] || 'Inactivo',
      };
    } else {
      console.log(`No delivery person found with id: ${id}`);
      return null;
    }
  } catch (error) {
    console.error("Error fetching delivery person:", error);
    return null;
  }
}

/**
 * Updates the status of a store in Firestore.
 * @param storeId The ID of the store to update.
 * @param status The new status ('Aprobado' or 'Rechazado').
 */
export async function updateStoreStatus(storeId: string, status: 'Aprobado' | 'Rechazado'): Promise<void> {
  try {
    const storeRef = doc(db, 'stores', storeId);
    await updateDoc(storeRef, { status });
  } catch (error) {
    console.error(`Error updating store status for ${storeId}:`, error);
    throw error;
  }
}

/**
 * Updates the status of a delivery person in Firestore.
 * @param personnelId The ID of the delivery person to update.
 * @param status The new status ('approved' or 'rejected').
 */
export async function updateDeliveryPersonnelStatus(personnelId: string, status: 'approved' | 'rejected'): Promise<void> {
  try {
    const userRef = doc(db, 'users', personnelId);
    await updateDoc(userRef, { status });
  } catch (error) {
    console.error(`Error updating delivery personnel status for ${personnelId}:`, error);
    throw error;
  }
}
