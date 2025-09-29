import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

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
    // Crea una referencia al documento del usuario en la colección 'users'.
    // El ID del documento será el UID del usuario.
    const userDocRef = doc(db, 'users', uid);
    
    // Usa setDoc para crear el documento. Si el documento ya existe, será sobrescrito.
    // La opción { merge: true } podría ser útil si solo quieres actualizar ciertos campos,
    // pero para la creación inicial, un setDoc directo es más claro.
    await setDoc(userDocRef, {
      uid, // Guardar el uid también en el documento puede ser útil para queries
      ...data,
      createdAt: new Date(), // Sellar la fecha de creación es una buena práctica.
    });
    
    console.log(`Perfil de usuario creado/actualizado para UID: ${uid}`);
  } catch (error) {
    console.error("Error al crear el perfil de usuario en Firestore: ", error);
    // Propaga el error para que la función que llama pueda manejarlo (e.j., mostrar un toast al usuario).
    throw new Error("No se pudo crear el perfil de usuario.");
  }
}
