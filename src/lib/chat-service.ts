import { db } from './firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, getDoc, doc, orderBy } from 'firebase/firestore';

/**
 * Gets or creates a chat room between a user and a store.
 * @param userId - The ID of the user.
 * @param storeId - The ID of the store.
 * @returns The ID of the chat room.
 */
export async function getOrCreateChat(userId: string, storeId: string): Promise<string> {
  const chatsRef = collection(db, 'chats');

  // Query for a chat containing both the user and the store ID.
  const q = query(chatsRef, 
    where('participants', 'array-contains', userId),
  );

  const querySnapshot = await getDocs(q);

  // Since we can't do array-contains for multiple values, we filter the results.
  const existingChat = querySnapshot.docs.find(doc => doc.data().participants.includes(storeId));

  if (existingChat) {
    // If a chat already exists, return its ID.
    return existingChat.id;
  } else {
    // If no chat exists, create a new one.
    
    // Get store and user details to store in the chat document for easier access.
    const userDoc = await getDoc(doc(db, 'users', userId));
    const storeDoc = await getDoc(doc(db, 'stores', storeId));

    if (!userDoc.exists() || !storeDoc.exists()) {
        throw new Error("User or Store not found");
    }

    const newChatRef = await addDoc(chatsRef, {
      participants: [userId, storeId],
      participantInfo: {
        [userId]: {
            name: userDoc.data().name,
            role: userDoc.data().role,
        },
        [storeId]: {
            name: storeDoc.data().name,
            role: 'store', // Hardcoded for clarity
            imageUrl: storeDoc.data().imageUrl,
        }
      },
      createdAt: serverTimestamp(),
      lastMessage: null,
      lastMessageTimestamp: null,
    });
    return newChatRef.id;
  }
}

export type ChatPreview = {
    id: string;
    otherParticipant: {
        id: string;
        name: string;
        imageUrl?: string;
    };
    lastMessage: string | null;
    lastMessageTimestamp: Date | null;
}

/**
 * Fetches all chat conversations for a given user.
 * @param userId The ID of the user.
 * @returns A list of chat previews.
 */
export async function getUserChats(userId: string): Promise<ChatPreview[]> {
    const chatsRef = collection(db, 'chats');
    const q = query(
        chatsRef, 
        where('participants', 'array-contains', userId),
        orderBy('lastMessageTimestamp', 'desc')
    );

    const querySnapshot = await getDocs(q);

    const chats: ChatPreview[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const otherParticipantId = data.participants.find((p: string) => p !== userId);
        const otherParticipantInfo = data.participantInfo[otherParticipantId];
        
        return {
            id: doc.id,
            otherParticipant: {
                id: otherParticipantId,
                name: otherParticipantInfo?.name || 'Usuario Desconocido',
                imageUrl: otherParticipantInfo?.imageUrl || `https://picsum.photos/seed/${otherParticipantId}/64/64`,
            },
            lastMessage: data.lastMessage || 'No hay mensajes todavía.',
            lastMessageTimestamp: data.lastMessageTimestamp?.toDate() || null,
        };
    });

    return chats;
}
