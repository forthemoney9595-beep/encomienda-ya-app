
'use server';
import { db } from './firebase';
import { collection, getDocs, query, doc, getDoc, where, updateDoc, addDoc, serverTimestamp, Timestamp, arrayUnion, deleteDoc } from 'firebase/firestore';
import type { Store, Product, DeliveryPersonnel } from './placeholder-data';
import { 
    prototypeStore, 
    getPrototypeProducts, 
    updatePrototypeStore, 
    addPrototypeProduct,
    updatePrototypeProduct,
    deletePrototypeProduct
} from './placeholder-data';
import type { AnalyzeDriverReviewsOutput } from '@/ai/flows/analyze-driver-reviews';
import { generateProductImage } from '@/ai/flows/generate-product-image';


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
    // Ensure we get the latest from session storage if available
    if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem('prototypeStore');
        return stored ? JSON.parse(stored) : prototypeStore;
    }
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

interface ProductData extends Omit<Product, 'id'> {
  imageFile?: File;
}

/**
 * Adds a new product to a store's 'products' subcollection.
 * If the product's category is new, it adds it to the store's `productCategories` array.
 * @param storeId The ID of the store.
 * @param productData The data for the new product.
 */
export async function addProductToStore(storeId: string, productData: Omit<Product, 'id'>): Promise<void> {
    if (storeId.startsWith('proto-')) {
        addPrototypeProduct(productData as Product);
        return;
    }
    
    try {
        const storeRef = doc(db, 'stores', storeId);
        const productsCollectionRef = collection(storeRef, 'products');
        
        // Add the product to the subcollection
        await addDoc(productsCollectionRef, productData);

        // Check if the category is new and update the store document
        const storeSnap = await getDoc(storeRef);
        if (storeSnap.exists()) {
            const storeData = storeSnap.data();
            const existingCategories = storeData.productCategories || [];
            if (!existingCategories.map((c: string) => c.toLowerCase()).includes(productData.category.toLowerCase())) {
                await updateDoc(storeRef, {
                    productCategories: arrayUnion(productData.category)
                });
            }
        }
    } catch (error) {
        console.error(`Error adding product to store ${storeId}:`, error);
        throw error;
    }
}

export async function updateProductInStore(storeId: string, productId: string, productData: Partial<Omit<Product, 'id'>>) {
    if (storeId.startsWith('proto-')) {
        updatePrototypeProduct(productId, productData);
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
        deletePrototypeProduct(productId);
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
                zone: 'Centro'
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
                zone: 'Centro'
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


export type DriverReview = {
  id: string;
  reviewText: string;
  analysis: Omit<AnalyzeDriverReviewsOutput, 'driverId'>;
  createdAt: Date;
}

/**
 * Adds a new driver review to the 'reviews' subcollection for a specific driver.
 * @param driverId The ID of the driver.
 * @param reviewData The review text and AI analysis data.
 */
export async function addDriverReview(driverId: string, reviewData: { reviewText: string, analysis: Omit<AnalyzeDriverReviewsOutput, 'driverId'> }): Promise<void> {
  try {
    const reviewsCollectionRef = collection(db, 'users', driverId, 'reviews');
    await addDoc(reviewsCollectionRef, {
      ...reviewData,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(`Error adding review for driver ${driverId}:`, error);
    throw error;
  }
}

/**
 * Fetches all reviews for a specific driver.
 * @param driverId The ID of the driver.
 */
export async function getDriverReviews(driverId: string): Promise<DriverReview[]> {
  try {
    const reviewsRef = collection(db, 'users', driverId, 'reviews');
    const q = query(reviewsRef, where('createdAt', '!=', null)); // Simple query to enable ordering
    const querySnapshot = await getDocs(q);

    const reviews: DriverReview[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        reviewText: data.reviewText,
        analysis: data.analysis,
        createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
      };
    });

    // Sort by date client-side as Firestore requires a composite index for this query otherwise
    reviews.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return reviews;
  } catch (error) {
    console.error(`Error fetching reviews for driver ${driverId}:`, error);
    return [];
  }
}

