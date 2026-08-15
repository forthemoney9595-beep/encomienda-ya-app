'use client';

// Tanda C de la auditoría: este archivo tenía 7 exports y SEIS estaban muertos
// (getUserProfile, createUserProfile, updateUserProfile, addUserAddress,
// deleteUserAddress, createStoreForUser — 0 importadores en toda la app; el CRUD real
// del perfil vive inline en /profile y el alta de tienda en /signup/store). Sobrevive
// solo buildNewStoreData, el único que se importa (signup/store/page.tsx).

import type { Store } from './placeholder-data';
import { getPlaceholderImage } from './placeholder-images';

/** Arma el documento de una tienda nueva (usado por el batch del alta de tienda). */
export function buildNewStoreData(ownerId: string, storeData: { name: string, category: string, address: string }): Omit<Store, 'id'> {
    return {
        ...storeData,
        ownerId: ownerId,
        status: 'Pendiente' as const,
        productCategories: storeData.category ? [storeData.category] : [],
        imageUrl: getPlaceholderImage(storeData.name.replace(/\s/g, ''), 600, 400),
        imageHint: storeData.category?.toLowerCase().split('-')[0] || 'store',
        products: [],
        horario: "9am - 5pm (simulado)",
        rating: 0,
        deliveryTime: "30-45 min",
        minOrder: 500,
    };
}
