'use client';
import { db } from './firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, getDoc, doc, orderBy, writeBatch, Unsubscribe, Timestamp } from 'firebase/firestore';
import { getPlaceholderImage } from './placeholder-images';
import type { UserProfile } from './user';

/**
 * Gets or creates a chat room between a user and a store owner.
 * @param currentUser - The profile of the user initiating the chat.
 * @param storeId - The ID of the store.
 * @returns The ID of the chat room.
 */
export async function getOrCreateChat(currentUser: { uid: string, name: string }, storeId: string): Promise<string> {
    const chatsRef = collection(db, 'chats');

    // First, get the store owner's ID
    const storeDoc = await getDoc(doc(db, 'stores', storeId));
    if (!storeDoc.exists()) {
        throw new Error("Store not found");
    }
    const storeData = storeDoc.data();
    const ownerId = storeData.ownerId;

    if (!ownerId) {
        throw new Error("Store owner not found");
    }

    if (currentUser.uid === ownerId) {
        throw new Error("Cannot create a chat with yourself.");
    }
    
    // Query for a chat containing both the user and the store owner ID.
    // Firestore requires the array elements to be in sorted order for this type of query.
    const sortedParticipants = [currentUser.uid, ownerId].sort();
    const q = query(
        chatsRef,
        where('participants', '==', sortedParticipants)
    );

    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        // If a chat already exists, return its ID.
        return querySnapshot.docs[0].id;
    } else {
        // If no chat exists, create a new one.
        const newChatRef = await addDoc(chatsRef, {
            participants: sortedParticipants,
            participantInfo: {
                [currentUser.uid]: {
                    name: currentUser.name || 'Comprador',
                    role: 'buyer',
                    imageUrl: getPlaceholderImage(currentUser.uid, 64, 64)
                },
                [ownerId]: {
                    name: storeData.name,
                    role: 'store',
                    imageUrl: storeData.imageUrl,
                }
            },
            createdAt: serverTimestamp(),
            lastMessage: null,
            lastMessageTimestamp: null,
        });
        return newChatRef.id;
    }
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


/**
 * Subscribes to new messages in a chat.
 * @param chatId The ID of the chat.
 * @param onNewMessages Callback function to be called with new messages.
 * @returns An unsubscribe function.
 */
export function onNewMessage(chatId: string, onNewMessages: (messages: Message[], chatDetails: ChatDetails) => void): Unsubscribe {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

  // First, get chat details once
  getDoc(doc(db, 'chats', chatId)).then(chatDoc => {
    if (!chatDoc.exists()) {
        console.error("Chat does not exist!");
        return;
    }
    const chatData = chatDoc.data();
    const currentUserId = chatData.participants.find((p:string) => p !== 'placeholder'); // This needs current user ID logic. We'll fix this.

    // Subscribe to messages
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const messages = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                text: data.text,
                senderId: data.senderId,
                // Firestore timestamps can be null on the client before they are set by the server.
                createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
            };
        });

        // We'll figure out the other participant dynamically in the hook/component
        const chatDetails = {
            id: chatDoc.id,
            participants: chatData.participants,
            participantInfo: chatData.participantInfo
        }

        // We need to pass both messages and details. For now, let's just pass messages.
        // We will pass chatDetails later.
        onNewMessages(messages, chatDetails as any);
    });

    return unsubscribe;
  });


  // The outer function needs to return the unsubscribe function.
  // The structure above is a bit tricky, let's simplify for the hook to manage.
  // The hook will get chat details, then call this.

  return onSnapshot(q, (querySnapshot) => {
    const messages = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            text: data.text,
            senderId: data.senderId,
            createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
        };
    });
    // This is incomplete, the callback needs chatDetails too.
    // The hook will solve this. For now, let's just pass an empty object.
    // onNewMessages(messages, {} as ChatDetails);
  });
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
