
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/firebase';
import { onSnapshot, collection, query, orderBy, Timestamp } from 'firebase/firestore';
import { sendMessage as sendMessageService, getChatDetails, type Message, type ChatDetails } from '@/lib/chat-service';


export function useChat(chatId: string) {
    const { user, loading: authLoading } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatDetails, setChatDetails] = useState<ChatDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const db = useFirestore();

    useEffect(() => {
        if (!user || !chatId) return;

        const fetchDetailsAndSubscribe = async () => {
            setLoading(true);
            try {
                const details = await getChatDetails(chatId, user.uid);
                // Fallback if details are incomplete to prevent crash
                if (details && !details.otherParticipant.name) {
                    details.otherParticipant.name = "Usuario Desconocido";
                }
                setChatDetails(details);

                const messagesRef = collection(db, 'chats', chatId, 'messages');
                const q = query(messagesRef, orderBy('createdAt', 'asc'));

                const unsubscribe = onSnapshot(q, (querySnapshot) => {
                    const fetchedMessages = querySnapshot.docs.map(doc => {
                        const data = doc.data();
                        return {
                            id: doc.id,
                            text: data.text,
                            senderId: data.senderId,
                            createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
                        };
                    });
                    setMessages(fetchedMessages);
                    setLoading(false); // Set loading to false once messages are loaded
                }, (error) => {
                    console.error("Error al suscribirse a los mensajes:", error);
                    setLoading(false);
                });
                
                return () => unsubscribe();
            } catch (error) {
                console.error("Error fetching chat details:", error);
                setLoading(false);
            }
        };

        const unsubscribePromise = fetchDetailsAndSubscribe();

        return () => {
            unsubscribePromise.then(unsubscribe => unsubscribe && unsubscribe());
        };

    }, [chatId, user, db]);

    const sendMessage = useCallback(async (text: string) => {
        if (!user || !chatId) return;

        try {
            await sendMessageService(chatId, user.uid, text);
        } catch (error) {
            console.error("Error al enviar el mensaje:", error);
            // Optionally: show a toast notification
        }
    }, [chatId, user]);

    return {
        messages,
        chatDetails,
        sendMessage,
        loading: authLoading || loading,
    };
}
