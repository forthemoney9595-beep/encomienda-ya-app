import { collection, doc, getDoc, getDocs, writeBatch, type Firestore } from "firebase/firestore";
import { prototypeUsers } from "./placeholder-data";

/**
 * Seeds the database with prototype users and a store if they don't exist.
 * This function is designed to be run only once on startup.
 * @param db The Firestore instance.
 */
export async function seedDatabase(db: Firestore) {
  // Use a special document as a flag to check if seeding has been done.
  const seedFlagRef = doc(db, "internal", "db_seeded");
  const seedFlagDoc = await getDoc(seedFlagRef);

  if (seedFlagDoc.exists()) {
    // console.log("Database already seeded. Skipping.");
    return;
  }

  console.log("First startup: Seeding database with prototype data...");

  const batch = writeBatch(db);

  try {
    // 1. Create User Profiles
    for (const email of Object.keys(prototypeUsers)) {
      const userRef = doc(collection(db, "users"));
      const userData = prototypeUsers[email];
      
      const profileData: any = {
        uid: userRef.id,
        ...userData,
        status: (userData.role === 'store' || userData.role === 'delivery') ? 'approved' : null
      };

      if (userData.role === 'delivery') {
        profileData.vehicle = 'motocicleta';
        profileData.zone = 'Centro';
      }
      
      batch.set(userRef, profileData);

      // 2. If it's the store user, create a store and products for them.
      if (userData.role === 'store') {
        const storeRef = doc(collection(db, "stores"));
        const storeCategory = 'Comida Rápida';
        batch.set(storeRef, {
          name: "Hamburguesas IA",
          category: storeCategory,
          productCategories: [storeCategory, "Bebidas"],
          address: "Av. Hamburguesa 456",
          ownerId: userRef.id,
          status: 'Aprobado',
          imageUrl: "https://picsum.photos/seed/burger/600/400",
          imageHint: "burger joint",
        });

        // Add products to this store
        const products = [
            { name: "Hamburguesa Clásica IA", description: "La clásica con queso, lechuga y tomate.", price: 9.99, category: storeCategory, imageUrl: "https://picsum.photos/seed/classicburger/200/200" },
            { name: "Hamburguesa Doble IA", description: "Doble carne, doble queso, para los con más hambre.", price: 12.99, category: storeCategory, imageUrl: "https://picsum.photos/seed/doubleburger/200/200" },
            { name: "Refresco", description: "Burbujas refrescantes.", price: 2.50, category: "Bebidas", imageUrl: "https://picsum.photos/seed/soda/200/200" },
        ];
        
        products.forEach(product => {
            const productRef = doc(collection(db, `stores/${storeRef.id}/products`));
            batch.set(productRef, product);
        });
      }
    }

    // Set the flag to indicate seeding is complete.
    batch.set(seedFlagRef, { seeded_at: new Date() });

    // Commit all the batched writes.
    await batch.commit();
    console.log("Database seeded successfully!");

  } catch (error) {
    console.error("Error seeding database:", error);
  }
}
