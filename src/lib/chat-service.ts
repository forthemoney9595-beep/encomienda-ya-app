
'use client';
import { db } from './firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, getDoc, doc, orderBy, writeBatch, Unsubscribe, Timestamp, setDoc } from 'firebase/firestore';
import { getPlaceholderImage } from './placeholder-images';
import type { Store } from './placeholder-data';
import type { UserProfile } from './user';

/**
 * Gets or creates a chat room between a user and a store owner using a deterministic ID.
 * This is a pure function that receives all necessary data.
 * @param currentUser - The profile of the user initiating the chat.
 * @param store - The store being contacted.
 * @returns The ID of the chat room.
 */
export async function getOrCreateChat(currentUser: UserProfile, store: Store): Promise<string> {
    const storeOwnerId = store.ownerId;
    if (!storeOwnerId) {
        throw new Error("La tienda no tiene un propietario asignado. No se puede crear el chat.");
    }
    if (currentUser.uid === storeOwnerId) {
        throw new Error("No puedes crear un chat contigo mismo.");
    }

    const participants = [currentUser.uid, storeOwnerId].sort();
    const chatId = participants.join('_'); // Deterministic ID

    const chatRef = doc(db, 'chats', chatId);

    // Use setDoc with merge: true. This will create the doc if it doesn't exist,
    // or do nothing if it does exist (as we are providing the same participant data).
    await setDoc(chatRef, {
        participants: participants,
        participantInfo: {
            [currentUser.uid]: {
                name: currentUser.name,
                role: currentUser.role,
                imageUrl: getPlaceholderImage(currentUser.uid, 64, 64)
            },
            [storeOwnerId]: {
                name: store.name, // The chat is with the store itself
                role: 'store',
                imageUrl: store.imageUrl
            }
        },
        // Only set createdAt on initial creation - merge won't add it again.
        // A better approach is to manage this server-side with rules, but for client-side this is a common pattern.
        // Let's rely on merge behavior and not add createdAt here to avoid overwriting.
        // It's better to update lastMessageTimestamp to indicate activity.
    }, { merge: true });

    return chatId;
}

export type ChatParticipant = {
    id: string;
    name: string;
    imageUrl?: string;
};

export type ChatDetails = {
    id: string;
    participants: string[];
    otherParticipant: ChatParticipant;
}

export type ChatPreview = {
    id: string;
    otherParticipant: ChatParticipant;
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
                imageUrl: otherParticipantInfo?.imageUrl || getPlaceholderImage(otherParticipantId, 64, 64),
            },
            lastMessage: data.lastMessage || 'No hay mensajes todavía.',
            lastMessageTimestamp: data.lastMessageTimestamp?.toDate() || null,
        };
    });

    return chats;
}


export interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: Date;
}

/**
 * Sends a message in a chat and updates the chat's last message.
 * @param chatId The ID of the chat.
 * @param senderId The ID of the message sender.
 * @param text The message text.
 */
export async function sendMessage(chatId: string, senderId: string, text: string): Promise<void> {
  const chatRef = doc(db, 'chats', chatId);
  const messagesRef = collection(chatRef, 'messages');

  const batch = writeBatch(db);

  // Add the new message
  const newMessageRef = doc(messagesRef);
  batch.set(newMessageRef, {
    text,
    senderId,
    createdAt: serverTimestamp(),
  });

  // Update the last message on the chat document
  batch.update(chatRef, {
    lastMessage: text,
    lastMessageTimestamp: serverTimestamp(),
  });

  await batch.commit();
}

export async function getChatDetails(chatId: string, currentUserId: string): Promise<ChatDetails | null> {
    const chatDoc = await getDoc(doc(db, 'chats', chatId));
    if (!chatDoc.exists()) {
        console.error("Chat does not exist!");
        return null;
    }

    const data = chatDoc.data();
    const otherParticipantId = data.participants.find((p: string) => p !== currentUserId);

    if (!otherParticipantId) {
        console.error("Could not find other participant in chat.");
        return null;
    }

    const otherParticipantInfo = data.participantInfo[otherParticipantId];

    return {
        id: chatDoc.id,
        participants: data.participants,
        otherParticipant: {
            id: otherParticipantId,
            name: otherParticipantInfo?.name || 'Usuario Desconocido',
            imageUrl: otherParticipantInfo?.imageUrl || getPlaceholderImage(otherParticipantId, 64, 64),
        }
    };
}
