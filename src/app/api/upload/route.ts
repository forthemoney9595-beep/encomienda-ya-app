import { NextResponse } from 'next/server';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firebaseApp } from '@/firebase';

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const path = formData.get('path') as string;

  if (!file || !path) {
    return NextResponse.json({ error: 'No se proporcionó ningún archivo o ruta.' }, { status: 400 });
  }

  try {
    const storage = getStorage(firebaseApp);
    const storageRef = ref(storage, path);
    
    await uploadBytes(storageRef, file, { contentType: file.type });
    
    const downloadUrl = await getDownloadURL(storageRef);

    return NextResponse.json({ imageUrl: downloadUrl });

  } catch (error: any) {
    console.error('Error al subir a Firebase Storage desde API route:', error);
    return NextResponse.json({ error: 'La subida del archivo ha fallado.', details: error.message, code: error.code }, { status: 500 });
  }
}
