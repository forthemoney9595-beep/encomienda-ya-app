'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, limit, addDoc, serverTimestamp, CollectionReference, Timestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import type { Order } from '@/lib/order-service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge'; // ✅ Importamos Badge para los chips

interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    senderRole: 'store' | 'delivery';
    text: string;
    createdAt: Timestamp;
}

interface ChatWindowProps {
    order: Order;
}

// ✅ CONFIGURACIÓN: Respuestas Rápidas por Rol
const QUICK_REPLIES = {
    store: [
      "¡El pedido está listo!",
      "Sale en 5 minutos",
      "¿Ya llegaste?",
      "Gracias por esperar"
    ],
    delivery: [
      "Estoy en camino",
      "Llegué al local",
      "Llegué al domicilio",
      "No encuentro la dirección",
      "Estoy demorado en el tráfico"
    ]
};

export function ChatWindow({ order }: ChatWindowProps) {
    const { user: myUser, userProfile } = useAuth();
    const firestore = useFirestore();
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const chatQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'order_chats', order.id, 'messages'),
            orderBy('createdAt', 'asc'),
            limit(50)
        ) as CollectionReference<ChatMessage>;
    }, [firestore, order.id]);

    const { data: messages, isLoading: loadingMessages } = useCollection<ChatMessage>(chatQuery);
    
    const myRole = userProfile?.role as 'store' | 'delivery' | undefined;
    const isAllowed = myRole === 'store' || myRole === 'delivery';

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ✅ ACTUALIZADO: Ahora acepta un texto opcional para las respuestas rápidas
    const handleSend = async (e?: React.FormEvent, textToSend?: string) => {
        if (e) e.preventDefault();
        
        const text = textToSend || newMessage;

        if (!myUser || !userProfile || !text.trim() || !isAllowed || isSending || !firestore) return;
        
        setIsSending(true);
        
        try {
            const messageData = {
                senderId: myUser.uid,
                senderName: userProfile.displayName || userProfile.name || 'Usuario',
                senderRole: myRole,
                text: text.trim(),
                createdAt: serverTimestamp(),
            };
            
            await addDoc(collection(firestore, 'order_chats', order.id, 'messages'), messageData);
            setNewMessage('');
            
        } catch (error) {
            console.error("Error al enviar mensaje:", error);
        } finally {
            setIsSending(false);
        }
    };

    if (!isAllowed) {
        return <Card><CardContent className="p-4 text-center text-muted-foreground"><MessageSquare className="mx-auto h-6 w-6 mb-2" />Chat no disponible para tu rol.</CardContent></Card>;
    }

    const MessageBubble = ({ message }: { message: ChatMessage }) => {
        const isMine = message.senderId === myUser?.uid;
        
        return (
            <div className={cn("flex w-full", isMine ? "justify-end" : "justify-start")}>
                <div 
                    className={cn(
                        "max-w-[75%] p-3 rounded-xl shadow-md",
                        isMine ? "bg-primary text-primary-foreground rounded-br-none" : "bg-muted rounded-bl-none"
                    )}
                >
                    {!isMine && (
                         <p className={cn("text-xs font-bold mb-1", message.senderRole === 'store' ? "text-red-500" : "text-blue-500")}>
                            {message.senderName} ({message.senderRole === 'store' ? 'Tienda' : 'Repartidor'})
                        </p>
                    )}
                    <p className="text-sm break-words">{message.text}</p>
                    <p className={cn("text-[10px] mt-1 opacity-70", isMine ? "text-right" : "text-left")}>
                        {message.createdAt && typeof (message.createdAt as any).toDate === 'function' 
                            ? format((message.createdAt as any).toDate(), 'HH:mm', { locale: es })
                            : 'Cargando...'}
                    </p>
                </div>
            </div>
        );
    };

    // Seleccionamos las respuestas según el rol
    const currentReplies = myRole && QUICK_REPLIES[myRole] ? QUICK_REPLIES[myRole] : [];

    return (
        <Card className="h-[500px] flex flex-col">
            <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Chat de Coordinación
                </CardTitle>
                <CardDescription>Pedido #{order.id.substring(0, 7)}</CardDescription>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                    <div className="text-center py-10">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    messages?.map(msg => <MessageBubble key={msg.id} message={msg} />)
                )}
                <div ref={messagesEndRef} />
            </CardContent>

            {/* ✅ SECCIÓN DE INPUT MEJORADA CON CHIPS */}
            <CardFooter className="p-4 border-t flex-col gap-3 items-start">
                
                {/* Lista de Respuestas Rápidas */}
                {currentReplies.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-1">
                        {currentReplies.map((reply, index) => (
                            <Badge 
                                key={index} 
                                variant="secondary" 
                                className="cursor-pointer hover:bg-primary/20 transition-colors py-1 px-3 border border-transparent hover:border-primary/30 text-xs font-normal"
                                onClick={() => handleSend(undefined, reply)}
                            >
                                {reply}
                            </Badge>
                        ))}
                    </div>
                )}

                <form onSubmit={handleSend} className="flex w-full space-x-2">
                    <Input
                        type="text"
                        placeholder="Escribe un mensaje..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        disabled={isSending}
                    />
                    <Button type="submit" size="icon" disabled={isSending}>
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </form>
            </CardFooter>
        </Card>
    );
}