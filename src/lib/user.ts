'use client';

import type { UserProfile, Address } from './placeholder-data';
import { getPlaceholderImage } from './placeholder-images';

/**
 * Fetches a user profile from Firestore.
 * @param uid The user's ID.
 * @returns The user profile object or null if not found.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
    // This is a placeholder for prototype mode. 
    // In a real app, you would fetch this from Firestore.
    console.warn("getUserProfile is a placeholder in prototype mode.");
    return null;
}


/**
 * Crea o actualiza un documento de perfil de usuario en Firestore.
 * @param uid El ID de usuario de Firebase Authentication.
 * @param data Los datos del perfil del usuario a guardar.
 */
export async function createUserProfile(uid: string, data: Partial<UserProfile>) {
  // This is a placeholder for prototype mode. 
  // In a real app, you would write this to Firestore.
  console.warn("createUserProfile is a placeholder in prototype mode.");
  return;
}

/**
 * Creates a store and associates it with a user.
 * @param ownerId The UID of the user who owns the store.
 * @param storeData Data for the new store.
 */
export async function createStoreForUser(ownerId: string, storeData: { name: string, category: string, address: string }) {
    // This is a placeholder for prototype mode. 
    // In a real app, you would write this to Firestore.
    console.warn("createStoreForUser is a placeholder in prototype mode.");
    const newStoreId = `proto-store-${Date.now()}`;
    const newStore = {
        id: newStoreId,
        ...storeData,
        ownerId: ownerId,
        status: 'Pendiente' as const,
        productCategories: storeData.category ? [storeData.category] : [],
        imageUrl: getPlaceholderImage(storeData.name.replace(/\s/g, ''), 600, 400),
        imageHint: storeData.category?.toLowerCase().split('-')[0] || 'store',
        products: [],
        horario: "9am - 5pm (simulado)"
    };
    
    // The actual state update is handled by the context provider
    return newStore;
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<UserProfile | null> {
    console.warn("updateUserProfile is a placeholder in prototype mode. State is managed in context.");
    // In a real app, this would update the user document in Firestore.
    // For prototype, the context will handle the state update.
    return null; 
}

    