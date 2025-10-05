import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { firebaseConfig } from '@/firebase/config';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: firebaseConfig.storageBucket,
    });
  } catch (error: any) {
    console.error('Firebase admin initialization error', error.stack);
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const path = formData.get('path') as string;

  if (!file || !path) {
    return NextResponse.json({ error: 'No file or path provided.' }, { status: 400 });
  }

  const bucket = admin.storage().bucket();
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const destination = `${path}/${Date.now()}-${file.name}`;
  const fileUpload = bucket.file(destination);

  try {
    await fileUpload.save(fileBuffer, {
      metadata: {
        contentType: file.type,
      },
    });

    const [url] = await fileUpload.getSignedUrl({
      action: 'read',
      expires: '03-09-2491', // A very long time in the future
    });

    return NextResponse.json({ imageUrl: url });
  } catch (error) {
    console.error('Error uploading to Firebase Storage:', error);
    return NextResponse.json({ error: 'Failed to upload file.' }, { status: 500 });
  }
}