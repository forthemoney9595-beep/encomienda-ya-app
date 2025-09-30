import { db } from './firebase';
import { doc, setDoc, addDoc, collection, serverTimestamp, getDoc } from 'firebase/firestore';

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
    // Ensure status is set for roles that need it
    if ((data.role === 'store' || data.role === 'delivery') && !data.status) {
      profileData.status = 'pending';
    }


    await setDoc(userDocRef, profileData);

    if (data.role === 'store') {
        const storeCollectionRef = collection(db, 'stores');
        await addDoc(storeCollectionRef, {
            name: data.storeName,
            category: data.storeCategory,
            productCategories: data.storeCategory ? [data.storeCategory] : [], 
            address: data.storeAddress,
            ownerId: uid,
            status: 'Pendiente',
            createdAt: serverTimestamp(),
            imageUrl: `https://picsum.photos/seed/${data.storeName.replace(/\s/g, '')}/600/400`,
            imageHint: data.storeCategory?.toLowerCase().split('-')[0] || 'store',
        });
    }
    
    console.log(`Perfil de usuario creado/actualizado para UID: ${uid}`);
  } catch (error) {
    console.error("Error al crear el perfil de usuario en Firestore: ", error);
    throw new Error("No se pudo crear el perfil de usuario.");
  }
}
