import { db } from './firebase';
import { collection, getDocs, query, doc, getDoc } from 'firebase/firestore';
import type { Store } from './placeholder-data';

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
      return { id: docSnap.id, ...docSnap.data() } as Store;
    } else {
      console.log(`No store found with id: ${id}`);
      return null;
    }
  } catch (error) {
    console.error("Error fetching store:", error);
    return null;
  }
}