import { db } from './firebase';
import { collection, getDocs, query, doc, getDoc, where } from 'firebase/firestore';
import type { Store, Product, DeliveryPersonnel } from './placeholder-data';

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
      };
    });
    
    return stores;
  } catch (error) {
    console.error("Error fetching stores from Firestore: ", error);
    return [];
  }
}


/**
 * Fetches a single store by its ID from Firestore.
 * @param id The ID of the store to fetch.
 */
export async function getStoreById(id: string): Promise<Store | null> {
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
      };
    });

    return products;
  } catch (error) {
    console.error(`Error fetching products for store ${storeId}:`, error);
    return [];
  }
}

/**
 * Fetches all delivery personnel from the 'users' collection in Firestore.
 */
export async function getDeliveryPersonnel(): Promise<DeliveryPersonnel[]> {
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
    
    return personnel;
  } catch (error) {
    console.error("Error fetching delivery personnel from Firestore: ", error);
    return [];
  }
}
