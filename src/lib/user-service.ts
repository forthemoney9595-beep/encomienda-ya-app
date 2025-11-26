

'use client';

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  addDoc,
  collection,
  DocumentReference,
  Firestore,
} from 'firebase/firestore';
import type { UserProfile, Address, Store } from './placeholder-data';
import { getPlaceholderImage } from './placeholder-images';
import { setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';

/**
 * Fetches a user profile from Firestore.
 * @param db The Firestore instance.
 * @param uid The user's ID.
 * @returns The user profile object or null if not found.
 */
export async function getUserProfile(db: Firestore, uid: string): Promise<UserProfile | null> {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return userSnap.data() as UserProfile;
  }
  return null;
}

/**
 * Creates or updates a user profile document in Firestore.
 * This is a non-blocking operation.
 * @param db The Firestore instance.
 * @param uid The user's ID from Firebase Authentication.
 * @param data The user profile data to save.
 */
export function createUserProfile(db: Firestore, uid: string, data: Partial<UserProfile>) {
  const userRef = doc(db, 'users', uid);
  setDocumentNonBlocking(userRef, data, { merge: true });
}

/**
 * Updates a user's profile information.
 * This is a non-blocking operation.
 * @param db The Firestore instance.
 * @param uid The user's ID.
 * @param data The data to update.
 */
export function updateUserProfile(db: Firestore, uid: string, data: Partial<UserProfile>) {
    if (!uid) return;
    const userRef = doc(db, 'users', uid);
    updateDocumentNonBlocking(userRef, data);
}

/**
 * Adds a new address to a user's profile.
 * This is a non-blocking operation.
 * @param db The Firestore instance.
 * @param uid The user's ID.
 * @param address The address object to add.
 */
export function addUserAddress(db: Firestore, uid: string, address: Address) {
    if (!uid) return;
    const userRef = doc(db, 'users', uid);
    updateDocumentNonBlocking(userRef, {
        addresses: arrayUnion(address)
    });
}

/**
 * Deletes an address from a user's profile.
 * This is a non-blocking operation.
 * @param db The Firestore instance.
 * @param uid The user's ID.
 * @param addressId The ID of the address to remove.
 */
export function deleteUserAddress(db: Firestore, uid: string, addressId: string) {
    if (!uid) return;
    // To remove an item from an array, we need to get the full object first.
    // This part remains a challenge with fully non-blocking, but for client-side it's often acceptable.
    getUserProfile(db, uid).then(user => {
        if (user && user.addresses) {
            const addressToRemove = user.addresses.find(a => a.id === addressId);
            if (addressToRemove) {
                const userRef = doc(db, 'users', uid);
                updateDocumentNonBlocking(userRef, {
                    addresses: arrayRemove(addressToRemove)
                });
            }
        }
    });
}


/**
 * Creates a store and associates it with a user.
 * This is a blocking operation because we need the new store's ID.
 * @param db The Firestore instance.
 * @param ownerId The UID of the user who owns the store.
 * @param storeData Data for the new store.
 */
export async function createStoreForUser(db: Firestore, ownerId: string, storeData: { name: string, category: string, address: string }): Promise<DocumentReference> {
    const storesCollectionRef = collection(db, 'stores');
    
    const newStoreData: Omit<Store, 'id'> = {
        ...storeData,
        ownerId: ownerId,
        status: 'Pendiente' as const,
        productCategories: storeData.category ? [storeData.category] : [],
        imageUrl: getPlaceholderImage(storeData.name.replace(/\s/g, ''), 600, 400),
        imageHint: storeData.category?.toLowerCase().split('-')[0] || 'store',
        products: [],
        horario: "9am - 5pm (simulado)"
    };

    const storeDocRef = await addDoc(storesCollectionRef, newStoreData);

    return storeDocRef;
}

