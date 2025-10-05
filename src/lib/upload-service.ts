
'use client';

// This file is being deprecated in favor of direct client-side uploads.
// The logic is now co-located with the components that use it to simplify state management and error handling.
// See /src/app/my-store/page.tsx and /src/app/stores/[storeId]/manage-item-dialog.tsx

import { storage } from '@/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * @deprecated Use direct client-side upload logic within your component.
 */
export async function uploadImage(file: File, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}
