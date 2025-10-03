

'use server';
import { collection, getDocs, query, doc, getDoc, where, updateDoc, addDoc, serverTimestamp, Timestamp, arrayUnion, deleteDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import type { Store, Product, DeliveryPersonnel } from './placeholder-data';


/**
 * Fetches stores from Firestore. This function is for real data and is not used in pure prototype mode.
 * @param all - If true, fetches all stores regardless of status. Otherwise, fetches only 'Aprobado' stores.
 */
export async function getStores(all: boolean = false): Promise<Store[]> {
  const { firestore } = getFirebase();
  let stores: Store[] = [];
  
  try {
    const storesCollectionRef = collection(firestore, 'stores');
    const q = all ? query(storesCollectionRef) : query(storesCollectionRef, where("status", "==", "Aprobado"));
    
    const querySnapshot = await getDocs(q);
    
    const storePromises = querySnapshot.docs.map(async (docSnapshot) => {
      const data = docSnapshot.data();
      // Fetch products for each store
      const products = await getProductsByStoreId(docSnapshot.id);
      return {
        id: docSnapshot.id,
        name: data.name || '',
        category: data.category || '',
        address: data.address || '',
        horario: data.horario || '',
        imageUrl: data.imageUrl || 'https://picsum.photos/seed/placeholder/600/400',
        imageHint: data.imageHint || 'store',
        status: data.status || 'Pendiente',
        ownerId: data.ownerId || '',
        productCategories: data.productCategories || [data.category] || [],
        products: products,
      };
    });

    stores = await Promise.all(storePromises);

  } catch (error) {
    console.error("Error fetching stores from Firestore: ", error);
  }
  
  return stores;
}


/**
 * Fetches a single store by its ID from Firestore. This function is for real data.
 * @param id The ID of the store to fetch.
 */
export async function getStoreById(id: string): Promise<Store | null> {
  const { firestore } = getFirebase();
  try {
    const docRef = doc(firestore, "stores", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const products = await getProductsByStoreId(id);
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
        products: products,
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
  const { firestore } = getFirebase();
  try {
    const productsCollectionRef = collection(firestore, 'stores', storeId, 'products');
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
 * @param storeId The ID of the store.
 * @param productData The data for the new product.
 * @param currentCategories The current list of categories for the store.
 */
export async function addProductToStore(storeId: string, productData: Product, currentCategories: string[]): Promise<void> {
    const { firestore } = getFirebase();
    try {
        const storeRef = doc(firestore, 'stores', storeId);
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

export async function updateProductInStore(storeId: string, productId: string, productData: Partial<Product>) {
    const { firestore } = getFirebase();
    try {
        const storeRef = doc(firestore, 'stores', storeId);
        const productRef = doc(firestore, 'stores', storeId, 'products', productId);
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

export async function deleteProductFromStore(storeId: string, productId: string) {
    const { firestore } = getFirebase();
    try {
        const productRef = doc(firestore, 'stores', storeId, 'products', productId);
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
  const { firestore } = getFirebase();
  let personnel: DeliveryPersonnel[] = [];
  try {
    const usersCollectionRef = collection(firestore, 'users');
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
export async function getDeliveryPersonById(id: string): Promise<(DeliveryPersonnel & { email: string }) | null> {
  const { firestore } = getFirebase();
  // In a pure prototype world, data comes from the client context
  if (id.startsWith('proto-')) {
    console.warn("getDeliveryPersonById server action called for prototype user.");
    return null;
  }

  try {
    const docRef = doc(firestore, "users", id);
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
  const { firestore } = getFirebase();
  try {
    const storeRef = doc(firestore, 'stores', storeId);
    await updateDoc(storeRef, { status });
  } catch (error) {
    console.error(`Error updating store status for ${storeId}:`, error);
    throw error;
  }
}

/**
 * Updates store data in Firestore.
 * @param storeId The ID of the store to update.
 * @param storeData The data to update.
 */
export async function updateStoreData(storeId: string, storeData: Partial<Store>): Promise<void> {
    const { firestore } = getFirebase();
    if (storeId.startsWith('proto-')) {
        console.warn('updateStoreData server action called for a prototype store. This should be handled on the client.');
        return;
    }
    try {
        const storeRef = doc(firestore, 'stores', storeId);
        await updateDoc(storeRef, storeData);
    } catch (error) {
        console.error(`Error updating store data for ${storeId}:`, error);
        throw error;
    }
}


/**
 * Updates the status of a delivery person in Firestore.
 * @param personnelId The ID of the delivery person to update.
 * @param status The new status ('approved' or 'rejected').
 */
export async function updateDeliveryPersonnelStatus(personnelId: string, status: 'approved' | 'rejected'): Promise<void> {
  const { firestore } = getFirebase();
  try {
    const userRef = doc(firestore, 'users', personnelId);
    await updateDoc(userRef, { status });
  } catch (error) {
    console.error(`Error updating delivery personnel status for ${personnelId}:`, error);
    throw error;
  }
}
