

'use server';
import { collection, getDocs, query, doc, getDoc, where, updateDoc, addDoc, serverTimestamp, Timestamp, arrayUnion, deleteDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { Store, Product, DeliveryPersonnel } from './placeholder-data';


/**
 * Fetches stores from Firestore. This function is for real data and is not used in pure prototype mode.
 * @param db The Firestore instance.
 * @param all - If true, fetches all stores regardless of status. Otherwise, fetches only 'Aprobado' stores.
 */
export async function getStores(db: Firestore, all: boolean = false): Promise<Store[]> {
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
        horario: data.horario || '',
        imageUrl: data.imageUrl || 'https://picsum.photos/seed/placeholder/600/400',
        imageHint: data.imageHint || 'store',
        status: data.status || 'Pendiente',
        ownerId: data.ownerId || '',
        productCategories: data.productCategories || [data.category] || [],
        products: [], // Products are fetched separately
      };
    });

  } catch (error) {
    console.error("Error fetching stores from Firestore: ", error);
  }
  
  return stores;
}


/**
 * Fetches a single store by its ID from Firestore. This function is for real data.
 * @param db The Firestore instance.
 * @param id The ID of the store to fetch.
 */
export async function getStoreById(db: Firestore, id: string): Promise<Store | null> {
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
        horario: data.horario || '',
        imageUrl: data.imageUrl || 'https://picsum.photos/seed/placeholder/600/400',
        imageHint: data.imageHint || 'store',
        status: data.status || 'Pendiente',
        ownerId: data.ownerId || '',
        productCategories: data.productCategories || [data.category] || [],
        products: [], // Products are fetched separately
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
 * @param db The Firestore instance.
 * @param storeId The ID of the store whose products to fetch.
 */
export async function getProductsByStoreId(db: Firestore, storeId: string): Promise<Product[]> {
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
        rating: data.rating || 0,
        reviewCount: data.reviewCount || 0,
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
 * @param db The Firestore instance.
 * @param storeId The ID of the store.
 * @param productData The data for the new product.
 * @param currentCategories The current list of categories for the store.
 */
export async function addProductToStore(db: Firestore, storeId: string, productData: Product, currentCategories: string[]): Promise<void> {
    try {
        const storeRef = doc(db, 'stores', storeId);
        // Firestore will auto-generate an ID if we use addDoc
        const productsCollectionRef = collection(storeRef, 'products');
        const newProductRef = doc(productsCollectionRef);
        
        await setDoc(newProductRef, { ...productData, id: newProductRef.id });

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

export async function updateProductInStore(db: Firestore, storeId: string, productId: string, productData: Partial<Product>) {
    try {
        const storeRef = doc(db, 'stores', storeId);
        const productRef = doc(db, 'stores', storeId, 'products', productId);
        await updateDoc(productRef, productData);
        
        // Also ensure category exists on parent store
        if (productData.category) {
            await updateDoc(storeRef, {
                productCategories: arrayUnion(productData.category)
            });
        }

    } catch (error) {
        console.error(`Error updating product ${productId} in store ${storeId}:`, error);
        throw error;
    }
}

export async function deleteProductFromStore(db: Firestore, storeId: string, productId: string) {
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
export async function getDeliveryPersonnel(db: Firestore, isPrototype: boolean = false): Promise<DeliveryPersonnel[]> {
  let personnel: DeliveryPersonnel[] = [];
  try {
    const usersCollectionRef = collection(db, 'users');
    const q = query(usersCollectionRef, where('role', '==', 'delivery'));
    const querySnapshot = await getDocs(q);
    
    personnel = querySnapshot.docs.map(doc => {
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
  } catch (error) {
    console.error("Error fetching delivery personnel from Firestore: ", error);
  }
    
  return personnel;
}

/**
 * Fetches a single delivery person by their user ID.
 */
export async function getDeliveryPersonById(db: Firestore, id: string): Promise<(DeliveryPersonnel & { email: string }) | null> {
  // In a pure prototype world, data comes from the client context
  if (id.startsWith('proto-')) {
    console.warn("getDeliveryPersonById server action called for prototype user.");
    return null;
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
 * @param db The Firestore instance.
 * @param storeId The ID of the store to update.
 * @param status The new status ('Aprobado' or 'Rechazado').
 */
export async function updateStoreStatus(db: Firestore, storeId: string, status: 'Aprobado' | 'Rechazado'): Promise<void> {
  try {
    const storeRef = doc(db, 'stores', storeId);
    await updateDoc(storeRef, { status });
  } catch (error) {
    console.error(`Error updating store status for ${storeId}:`, error);
    throw error;
  }
}

/**
 * Updates store data in Firestore.
 * @param db The Firestore instance.
 * @param storeId The ID of the store to update.
 * @param storeData The data to update.
 */
export async function updateStoreData(db: Firestore, storeId: string, storeData: Partial<Store>): Promise<void> {
    if (storeId.startsWith('proto-')) {
        console.warn('updateStoreData server action called for a prototype store. This should be handled on the client.');
        return;
    }
    try {
        const storeRef = doc(db, 'stores', storeId);
        await updateDoc(storeRef, storeData);
    } catch (error) {
        console.error(`Error updating store data for ${storeId}:`, error);
        throw error;
    }
}


/**
 * Updates the status of a delivery person in Firestore.
 * @param db The Firestore instance.
 * @param personnelId The ID of the delivery person to update.
 * @param status The new status ('approved' or 'rejected').
 */
export async function updateDeliveryPersonnelStatus(db: Firestore, personnelId: string, status: 'approved' | 'rejected'): Promise<void> {
  try {
    const userRef = doc(db, 'users', personnelId);
    await updateDoc(userRef, { status });
  } catch (error) {
    console.error(`Error updating delivery personnel status for ${personnelId}:`, error);
    throw error;
  }
}
