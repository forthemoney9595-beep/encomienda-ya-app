import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
