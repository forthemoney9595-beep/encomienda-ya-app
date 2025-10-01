
import { db } from './firebase';
import { doc, setDoc, addDoc, collection, serverTimestamp, getDoc, updateDoc } from 'firebase/firestore';

// Define un tipo para los datos del perfil de usuario para mayor claridad y seguridad de tipos.
type UserProfileData = {
  name: string;
  email: string;
  role: 'buyer' | 'store' | 'delivery' | 'admin';
  status?: 'pending' | 'approved' | 'rejected';
  [key: string]: any; // Permite otras propiedades como storeName, vehicle, etc.
};

export interface UserProfile extends UserProfileData {
    uid: string;
}

/**
 * Fetches a user profile from Firestore.
 * @param uid The user's ID.
 * @returns The user profile object or null if not found.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
        const userDocRef = doc(db, 'users', uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            return { uid, ...userDoc.data() } as UserProfile;
        }
        return null;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }
}


/**
 * Crea o actualiza un documento de perfil de usuario en Firestore.
 * @param uid El ID de usuario de Firebase Authentication.
 * @param data Los datos del perfil del usuario a guardar.
 */
export async function createUserProfile(uid: string, data: UserProfileData) {
  try {
    const userDocRef = doc(db, 'users', uid);
    
    const profileData: any = {
      uid, 
      ...data,
      createdAt: serverTimestamp(),
    };

    if (data.role === 'delivery') {
        profileData.status = 'pending';
    }

    await setDoc(userDocRef, profileData);
    
    console.log(`Perfil de usuario creado/actualizado para UID: ${uid}`);
  } catch (error) {
    console.error("Error al crear el perfil de usuario en Firestore: ", error);
    throw new Error("No se pudo crear el perfil de usuario.");
  }
}

/**
 * Creates a store and associates it with a user.
 * @param ownerId The UID of the user who owns the store.
 * @param storeData Data for the new store.
 */
export async function createStoreForUser(ownerId: string, storeData: { name: string, category: string, address: string }) {
    try {
        const storeCollectionRef = collection(db, 'stores');
        const newStoreRef = await addDoc(storeCollectionRef, {
            ...storeData,
            ownerId: ownerId,
            status: 'Aprobado', // Auto-approve for faster prototype cycle
            createdAt: serverTimestamp(),
            productCategories: storeData.category ? [storeData.category] : [],
            imageUrl: `https://picsum.photos/seed/${storeData.name.replace(/\s/g, '')}/600/400`,
            imageHint: storeData.category?.toLowerCase().split('-')[0] || 'store',
        });

        // Update the user's profile with the new storeId
        const userDocRef = doc(db, 'users', ownerId);
        await updateDoc(userDocRef, { storeId: newStoreRef.id });

        return { id: newStoreRef.id, ...storeData };
    } catch (error) {
        console.error("Error creating store for user: ", error);
        throw new Error("Could not create store.");
    }
}
