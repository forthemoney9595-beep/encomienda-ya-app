import { db } from './firebase';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

// Define un tipo para los datos del perfil de usuario para mayor claridad y seguridad de tipos.
type UserProfileData = {
  name: string;
  email: string;
  role: 'buyer' | 'store' | 'delivery' | 'admin';
  status?: 'pending' | 'approved' | 'rejected';
  [key: string]: any; // Permite otras propiedades como storeName, vehicle, etc.
};

/**
 * Crea o actualiza un documento de perfil de usuario en Firestore.
 * @param uid El ID de usuario de Firebase Authentication.
 * @param data Los datos del perfil del usuario a guardar.
 */
export async function createUserProfile(uid: string, data: UserProfileData) {
  try {
    const userDocRef = doc(db, 'users', uid);
    
    await setDoc(userDocRef, {
      uid, 
      ...data,
      createdAt: serverTimestamp(),
    });

    if (data.role === 'store') {
        const storeCollectionRef = collection(db, 'stores');
        await addDoc(storeCollectionRef, {
            name: data.storeName,
            category: data.storeCategory,
            // Only add the category to the array if it exists, otherwise initialize as empty array
            productCategories: data.storeCategory ? [data.storeCategory] : [], 
            address: data.storeAddress,
            ownerId: uid,
            status: 'Pendiente',
            createdAt: serverTimestamp(),
            imageUrl: `https://picsum.photos/seed/${data.storeName.replace(/\s/g, '')}/600/400`,
            imageHint: data.storeCategory.toLowerCase().split('-')[0] || 'store',
        });
    }
    
    console.log(`Perfil de usuario creado/actualizado para UID: ${uid}`);
  } catch (error) {
    console.error("Error al crear el perfil de usuario en Firestore: ", error);
    throw new Error("No se pudo crear el perfil de usuario.");
  }
}
