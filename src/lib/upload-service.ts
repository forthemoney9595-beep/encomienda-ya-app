
'use client';
import { initializeFirebase } from '@/firebase/index';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, type UploadTaskSnapshot } from 'firebase/storage';

/**
 * Uploads an image file to Firebase Storage.
 * @param file The image file to upload.
 * @param onProgress A callback function to receive upload progress updates.
 * @returns A promise that resolves with the public download URL of the uploaded image.
 */
export async function uploadImage(
    file: File,
    onProgress: (progress: number) => void
): Promise<string> {
    
    if (!file.type.startsWith('image/')) {
        throw new Error('El archivo seleccionado no es una imagen.');
    }

    // Limit file size to 5MB
    if (file.size > 5 * 1024 * 1024) {
        throw new Error('La imagen no puede superar los 5MB.');
    }
    const { firebaseApp } = initializeFirebase();
    const storage = getStorage(firebaseApp);

    const storageRef = ref(storage, `images/${Date.now()}-${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
        uploadTask.on(
            'state_changed',
            (snapshot: UploadTaskSnapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                onProgress(progress);
            },
            (error) => {
                console.error("Error en la subida:", error);
                switch (error.code) {
                    case 'storage/unauthorized':
                        reject(new Error("No tienes permiso para subir archivos. Revisa las reglas de seguridad de Firebase Storage."));
                        break;
                    case 'storage/canceled':
                        reject(new Error("La subida de la imagen ha sido cancelada."));
                        break;
                    default:
                        reject(new Error("No se pudo subir la imagen. Código de error: " + error.code));
                        break;
                }
            },
            async () => {
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    onProgress(100); // Ensure it hits 100% on completion
                    resolve(downloadURL);
                } catch (error) {
                     console.error("Error al obtener la URL de descarga:", error);
                     reject(new Error("No se pudo obtener la URL de la imagen subida."));
                }
            }
        );
    });
}
