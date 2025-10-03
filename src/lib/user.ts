
'use client';

import { doc, setDoc, addDoc, collection, serverTimestamp, getDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { getPlaceholderImage } from './placeholder-images';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';

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
export async function getUserProfile(db: Firestore, uid: string): Promise<UserProfile | null> {
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
export async function createUserProfile(db: Firestore, uid: string, data: UserProfileData) {
  const userDocRef = doc(db, 'users', uid);
    
  const profileData: any = {
    uid, 
    ...data,
    createdAt: serverTimestamp(),
  };

  if (data.role === 'delivery') {
      profileData.status = 'pending';
  }

  // Use a non-blocking write with contextual error handling
  setDoc(userDocRef, profileData).catch(serverError => {
      const permissionError = new FirestorePermissionError({
          path: userDocRef.path,
          operation: 'write',
          requestResourceData: profileData,
      });
      // Emit the error globally
      errorEmitter.emit('permission-error', permissionError);
      // We don't re-throw here, the listener will handle it.
      console.error("Error creating user profile, handled by emitter:", serverError);
  });
}

/**
 * Creates a store and associates it with a user.
 * @param ownerId The UID of the user who owns the store.
 * @param storeData Data for the new store.
 */
export async function createStoreForUser(db: Firestore, ownerId: string, storeData: { name: string, category: string, address: string }) {
    try {
        const storeCollectionRef = collection(db, 'stores');
        const newStoreRef = doc(storeCollectionRef); // Create a new doc reference with an auto-generated ID

        // Then, set the store document
        await setDoc(newStoreRef, {
            id: newStoreRef.id,
            ...storeData,
            ownerId: ownerId,
            status: 'Pendiente', // All new stores require approval
            createdAt: serverTimestamp(),
            productCategories: storeData.category ? [storeData.category] : [],
            imageUrl: getPlaceholderImage(storeData.name.replace(/\s/g, ''), 600, 400),
            imageHint: storeData.category?.toLowerCase().split('-')[0] || 'store',
        });
        
        // Update the user's profile with the new storeId first
        const userDocRef = doc(db, 'users', ownerId);
        await updateDoc(userDocRef, { storeId: newStoreRef.id });


        return { id: newStoreRef.id, ...storeData };
    } catch (error) {
        console.error("Error creating store for user: ", error);
        throw new Error("Could not create store.");
    }
}
