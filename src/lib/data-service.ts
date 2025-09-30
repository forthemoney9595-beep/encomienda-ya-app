import { db } from './firebase';
import { collection, getDocs, query, doc, getDoc, where, updateDoc, addDoc, serverTimestamp, Timestamp, arrayUnion } from 'firebase/firestore';
import type { Store, Product, DeliveryPersonnel } from './placeholder-data';
import type { AnalyzeDriverReviewsOutput } from '@/ai/flows/analyze-driver-reviews';


/**
 * Fetches all stores from the 'stores' collection in Firestore.
 */
export async function getStores(): Promise<Store[]> {
  try {
    const storesCollectionRef = collection(db, 'stores');
    const q = query(storesCollectionRef); // You can add where clauses here, e.g., where('status', '==', 'Aprobado')
    const querySnapshot = await getDocs(q);
    
    const stores: Store[] = querySnapshot.docs.map(doc => {
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

    // Add a mock store for easy testing
    const mockStore: Store = {
      id: "IA-Test-Store-1",
      name: "Tienda de Prueba IA",
      category: "Comida Rápida",
      address: "Av. Ficticia 123, Ciudad Gema",
      imageUrl: "https://picsum.photos/seed/ia-store/600/400",
      imageHint: "test store",
      status: 'Aprobado',
      ownerId: "proto-store-owner",
      productCategories: ["Destacados"],
    };
    
    return [...stores, mockStore];
  } catch (error) {
    console.error("Error fetching stores from Firestore: ", error);
     // Return mock data on error to allow testing
    const mockStore: Store = {
      id: "IA-Test-Store-1",
      name: "Tienda de Prueba IA",
      category: "Comida Rápida",
      address: "Av. Ficticia 123, Ciudad Gema",
      imageUrl: "https://picsum.photos/seed/ia-store/600/400",
      imageHint: "test store",
      status: 'Aprobado',
      ownerId: "proto-store-owner",
      productCategories: ["Destacados"],
    };
    return [mockStore];
  }
}


/**
 * Fetches a single store by its ID from Firestore.
 * @param id The ID of the store to fetch.
 */
export async function getStoreById(id: string): Promise<Store | null> {
  // Return mock data if mock ID is provided
  if (id === "IA-Test-Store-1") {
     return {
        id: "IA-Test-Store-1",
        name: "Tienda de Prueba IA",
        category: "Comida Rápida",
        address: "Av. Ficticia 123, Ciudad Gema",
        imageUrl: "https://picsum.photos/seed/ia-store/600/400",
        imageHint: "test store",
        status: 'Aprobado',
        ownerId: "proto-store-owner",
        productCategories: ["Destacados"],
      };
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
  const mockProduct: Product = {
      id: "IA-Test-Product-1",
      name: "Producto de Prueba IA",
      description: "Este es un producto generado por IA para facilitar las pruebas del flujo de pedidos.",
      price: 9.99,
      category: "Destacados",
      imageUrl: "https://picsum.photos/seed/ia-product/200/200",
  };

  if (storeId === "IA-Test-Store-1") {
    return [mockProduct];
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
    return storeId === "IA-Test-Store-1" ? [mockProduct] : [];
  }
}

/**
 * Adds a new product to a store's 'products' subcollection.
 * If the product's category is new, it adds it to the store's `productCategories` array.
 * @param storeId The ID of the store.
 * @param productData The data for the new product.
 */
export async function addProductToStore(storeId: string, productData: Omit<Product, 'id'>): Promise<void> {
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


/**
 * Fetches all delivery personnel from the 'users' collection in Firestore.
 */
export async function getDeliveryPersonnel(): Promise<DeliveryPersonnel[]> {
    const mockDeliveryPerson: DeliveryPersonnel = {
      id: "proto-delivery",
      name: "Repartidor Proto",
      vehicle: "Motocicleta",
      zone: "Central",
      status: 'Activo',
    };
  try {
    const usersCollectionRef = collection(db, 'users');
    const q = query(usersCollectionRef, where('role', '==', 'delivery'));
    const querySnapshot = await getDocs(q);
    
    const personnel: DeliveryPersonnel[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        vehicle: data.vehicle || 'No especificado',
        zone: data.zone || 'No asignada',
        status: data.status === 'pending' ? 'Pendiente' : data.status === 'approved' ? 'Activo' : data.status === 'rejected' ? 'Rechazado' : 'Inactivo',
      };
    });
    
    return [...personnel, mockDeliveryPerson];
  } catch (error) {
    console.error("Error fetching delivery personnel from Firestore: ", error);
    return [mockDeliveryPerson];
  }
}

/**
 * Fetches a single delivery person by their user ID.
 * @param id The user ID of the delivery person.
 */
export async function getDeliveryPersonById(id: string): Promise<(DeliveryPersonnel & { email: string }) | null> {
    if (id === 'proto-delivery') {
        return {
            id: "proto-delivery",
            name: "Repartidor Proto",
            email: "repartidor@test.com",
            vehicle: "Motocicleta",
            zone: "Central",
            status: 'Activo',
        }
    }
  try {
    const docRef = doc(db, "users", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().role === 'delivery') {
      const data = docSnap.data();
      return { 
        id: docSnap.id,
        name: data.name || '',
        email: data.email || '',
        vehicle: data.vehicle || 'No especificado',
        zone: data.zone || 'No asignada',
        status: data.status === 'pending' ? 'Pendiente' : data.status === 'approved' ? 'Activo' : data.status === 'rejected' ? 'Rechazado' : 'Inactivo',
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
