
'use client';
import { storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL, type UploadTaskSnapshot } from 'firebase/storage';

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

    const storageRef = ref(storage, `product-images/${Date.now()}-${file.name}`);
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
                reject(new Error("No se pudo subir la imagen. Código de error: " + error.code));
            },
            async () => {
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(downloadURL);
                } catch (error) {
                    console.error("Error al obtener la URL de descarga:", error);
                    reject(new Error("No se pudo obtener la URL de la imagen subida."));
                }
            }
        );
    });
}
