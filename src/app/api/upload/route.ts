
import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    // In some environments (like Cloud Workstations), application default credentials aren't available.
    // We construct the credential object manually from environment variables.
    const serviceAccount = {
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `${serviceAccount.projectId}.appspot.com`,
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

    // Make the file publically readable
    await fileUpload.makePublic();

    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    return NextResponse.json({ imageUrl: publicUrl });
  } catch (error: any) {
    console.error('Error uploading to Firebase Storage:', error);
    return NextResponse.json({ error: 'Failed to upload file.', details: error.message }, { status: 500 });
  }
}
