import { NextResponse } from 'next/server';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/firebase/server'; // Usar la instancia del servidor

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string;

    if (!file || !path) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo o ruta.' }, { status: 400 });
    }

    const storageRef = ref(storage, path);
    
    // Convertir el archivo a un ArrayBuffer
    const fileBuffer = await file.arrayBuffer();
    
    await uploadBytes(storageRef, fileBuffer, { contentType: file.type });
    
    const downloadUrl = await getDownloadURL(storageRef);

    return NextResponse.json({ imageUrl: downloadUrl });

  } catch (error: any) {
    console.error('Error al subir a Firebase Storage desde API route:', error);
    // Proporcionar un mensaje de error más detallado en la respuesta
    const errorMessage = error.message || 'Error desconocido del servidor.';
    const errorCode = error.code || 'UNKNOWN_ERROR';
    return NextResponse.json({ error: 'La subida del archivo ha fallado.', details: errorMessage, code: errorCode }, { status: 500 });
  }
}
