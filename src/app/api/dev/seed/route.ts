import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Nota: el bloqueo de producción se hace dentro del handler GET (abajo).
// Un `throw` a nivel de módulo rompe el build de Next.js, porque la ruta
// se evalúa durante `next build` (que corre con NODE_ENV=production).

const TINOGASTA_COORDS = { latitude: -28.0639, longitude: -67.5683 };

const TEST_USERS = [
    {
        email: 'admin@test.encomienda',
        password: 'Test1234!',
        role: 'admin' as const,
        name: 'Admin Test',
        displayName: 'Admin Test',
    },
    {
        email: 'tienda@test.encomienda',
        password: 'Test1234!',
        role: 'store' as const,
        name: 'Dueño Pizzería',
        displayName: 'Dueño Pizzería',
    },
    {
        email: 'repartidor@test.encomienda',
        password: 'Test1234!',
        role: 'delivery' as const,
        name: 'Repartidor Test',
        displayName: 'Repartidor Test',
    },
    {
        email: 'cliente@test.encomienda',
        password: 'Test1234!',
        role: 'buyer' as const,
        name: 'Cliente Test',
        displayName: 'Cliente Test',
    },
];

const TEST_PRODUCTS = [
    { name: 'Pizza Margherita', description: 'Salsa de tomate, mozzarella y albahaca fresca.', price: 3500, category: 'Pizzas', available: true, isFeatured: true },
    { name: 'Pizza Napolitana', description: 'Salsa de tomate, mozzarella, anchoas y aceitunas.', price: 4000, category: 'Pizzas', available: true, isFeatured: false },
    { name: 'Empanadas x6', description: 'Seis empanadas de carne cortada a cuchillo.', price: 2800, category: 'Empanadas', available: true, isFeatured: true },
    { name: 'Coca-Cola 500ml', description: 'Bebida gaseosa fría.', price: 900, category: 'Bebidas', available: true, isFeatured: false },
    { name: 'Agua Mineral 500ml', description: 'Agua mineral sin gas.', price: 600, category: 'Bebidas', available: true, isFeatured: false },
    { name: 'Combo Pizza + Bebida', description: 'Una pizza Margherita + una Coca-Cola 500ml.', price: 4200, category: 'Combos', available: true, isFeatured: true },
];

async function getOrCreateUser(email: string, password: string, name: string) {
    try {
        const existing = await adminAuth.getUserByEmail(email);
        return { uid: existing.uid, created: false };
    } catch {
        const created = await adminAuth.createUser({ email, password, displayName: name, emailVerified: true });
        return { uid: created.uid, created: true };
    }
}

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'No disponible en producción.' }, { status: 403 });
    }

    try {
        const results: Record<string, any> = {};
        const batch = adminDb.batch();

        // --- 1. Crear/verificar usuarios ---
        const userIds: Record<string, string> = {};
        for (const u of TEST_USERS) {
            const { uid, created } = await getOrCreateUser(u.email, u.password, u.name);
            userIds[u.role] = uid;
            results[u.role] = { uid, email: u.email, password: u.password, created };
        }

        // --- 2. Crear perfil Admin ---
        batch.set(adminDb.collection('users').doc(userIds.admin), {
            uid: userIds.admin, name: 'Admin Test', displayName: 'Admin Test',
            email: 'admin@test.encomienda', role: 'admin',
            addresses: [], createdAt: Timestamp.now(),
        }, { merge: true });

        batch.set(adminDb.collection('roles_admin').doc(userIds.admin), {
            role: 'admin', createdAt: Timestamp.now(),
        }, { merge: true });

        // --- 3. Crear/recuperar tienda ---
        const storesSnap = await adminDb.collection('stores')
            .where('ownerId', '==', userIds.store).limit(1).get();

        let storeId: string;
        if (!storesSnap.empty) {
            storeId = storesSnap.docs[0].id;
            results.store.storeId = storeId;
            results.store.storeCreated = false;
        } else {
            const storeRef = adminDb.collection('stores').doc();
            storeId = storeRef.id;
            batch.set(storeRef, {
                id: storeId,
                name: 'Pizzería de Prueba',
                address: 'Rivadavia 500, Tinogasta, Catamarca',
                category: 'comida-rapida',
                ownerId: userIds.store,
                isApproved: true,
                status: 'Aprobado',
                rating: 4.5,
                deliveryTime: '30-45 min',
                minOrder: 500,
                maintenanceMode: false,
                coords: TINOGASTA_COORDS,
                location: TINOGASTA_COORDS,
                productCategories: ['Pizzas', 'Empanadas', 'Bebidas', 'Combos'],
                horario: '11:00 - 23:00',
                description: 'La mejor pizza de Tinogasta. Hacemos delivery todos los días.',
                createdAt: Timestamp.now(),
            });
            results.store.storeId = storeId;
            results.store.storeCreated = true;
        }

        // --- 4. Perfil del dueño de tienda ---
        batch.set(adminDb.collection('users').doc(userIds.store), {
            uid: userIds.store, name: 'Dueño Pizzería', displayName: 'Dueño Pizzería',
            email: 'tienda@test.encomienda', role: 'store', storeId,
            addresses: [], createdAt: Timestamp.now(),
        }, { merge: true });

        // --- 5. Perfil del repartidor ---
        batch.set(adminDb.collection('users').doc(userIds.delivery), {
            uid: userIds.delivery, name: 'Repartidor Test', displayName: 'Repartidor Test',
            email: 'repartidor@test.encomienda', role: 'delivery',
            vehicle: 'motocicleta', status: 'Activo', isApproved: true,
            phoneNumber: '+5493834000001', addresses: [], createdAt: Timestamp.now(),
        }, { merge: true });

        // --- 6. Perfil del comprador ---
        batch.set(adminDb.collection('users').doc(userIds.buyer), {
            uid: userIds.buyer, name: 'Cliente Test', displayName: 'Cliente Test',
            email: 'cliente@test.encomienda', role: 'buyer',
            phoneNumber: '+5493834000002',
            addresses: [{
                id: 'addr-test-1',
                label: 'Casa',
                street: 'San Martín 123',
                city: 'Tinogasta',
                zipCode: '5340',
                coords: TINOGASTA_COORDS,
            }],
            createdAt: Timestamp.now(),
        }, { merge: true });

        await batch.commit();

        // --- 7. Crear productos (fuera del batch por límite de 500 ops) ---
        const existingItems = await adminDb.collection('stores').doc(storeId)
            .collection('items').limit(1).get();

        if (existingItems.empty) {
            const productBatch = adminDb.batch();
            for (const product of TEST_PRODUCTS) {
                const itemRef = adminDb.collection('stores').doc(storeId).collection('items').doc();
                productBatch.set(itemRef, {
                    ...product,
                    imageUrl: '',
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                });
            }
            await productBatch.commit();
            results.products = { created: TEST_PRODUCTS.length, storeId };
        } else {
            results.products = { created: 0, message: 'Ya tenía productos, no se sobreescribieron.' };
        }

        return NextResponse.json({
            success: true,
            message: '✅ Datos de prueba creados correctamente.',
            credentials: {
                admin:       { email: 'admin@test.encomienda',      password: 'Test1234!' },
                tienda:      { email: 'tienda@test.encomienda',     password: 'Test1234!' },
                repartidor:  { email: 'repartidor@test.encomienda', password: 'Test1234!' },
                cliente:     { email: 'cliente@test.encomienda',    password: 'Test1234!' },
            },
            details: results,
        });

    } catch (error: any) {
        console.error('❌ Error en seeder:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
