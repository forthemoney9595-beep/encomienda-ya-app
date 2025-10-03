
'use client';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, getDoc, doc, orderBy, writeBatch, Unsubscribe, Timestamp, setDoc } from 'firebase/firestore';
import { getPlaceholderImage } from './placeholder-images';
import type { Store } from './placeholder-data';
import type { UserProfile } from './user';

/**
 * Represents a simplified user profile for chat purposes.
 */
export interface ChatParticipantProfile {
    uid: string;
    name: string;
    role: 'buyer' | 'store' | 'delivery' | 'admin';
    imageUrl: string;
}

/**
 * Creates a chat room between two participant profiles using a deterministic ID.
 * This function is now a pure utility for writing to Firestore.
 * @param participant1 - The profile of the first participant.
 * @param participant2 - The profile of the second participant.
 * @returns The ID of the chat room.
 */
export async function getOrCreateChat(db: ReturnType<typeof useFirestore>, participant1: ChatParticipantProfile, participant2: ChatParticipantProfile): Promise<string> {
    if (!participant1.uid || !participant2.uid) {
        throw new Error("Ambos participantes deben tener un UID válido.");
    }
    if (participant1.uid === participant2.uid) {
        throw new Error("No puedes crear un chat contigo mismo.");
    }

    const participants = [participant1.uid, participant2.uid].sort();
    const chatId = participants.join('_');

    const chatRef = doc(db, 'chats', chatId);

    // This operation will create the document if it doesn't exist,
    // or update the participant info if it does. It's idempotent and safe.
    await setDoc(chatRef, {
        participants: participants,
        participantInfo: {
            [participant1.uid]: {
                name: participant1.name,
                role: participant1.role,
                imageUrl: participant1.imageUrl
            },
            [participant2.uid]: {
                name: participant2.name,
                role: participant2.role,
                imageUrl: participant2.imageUrl
            }
        },
        lastMessageTimestamp: serverTimestamp(), // Update timestamp to show activity
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
    const db = useFirestore();
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
  const db = useFirestore();
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
    const db = useFirestore();
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
