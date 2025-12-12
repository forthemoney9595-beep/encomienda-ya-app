'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MessageSquare, Send, Loader2, User, Store, Bike, Bell } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, addDoc, serverTimestamp, CollectionReference, Timestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { type Order, OrderService } from '@/lib/order-service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    senderRole: 'store' | 'delivery' | 'buyer';
    text: string;
    createdAt: Timestamp;
}

interface ChatWindowProps {
    order: Order;
}

const QUICK_REPLIES = {
    store: ["¡El pedido está listo!", "Sale en 5 minutos", "¿Alguna preferencia?", "Gracias por su compra"],
    delivery: ["Estoy en camino", "Llegué al local", "Estoy afuera", "No encuentro el timbre", "Tráfico pesado"],
    buyer: ["¿Cuánto falta?", "Estoy en la puerta", "El timbre no funciona", "Gracias!", "¿Por dónde vienes?", "Faltan cubiertos"]
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
    
    const myRole = userProfile?.role as 'store' | 'delivery' | 'buyer' | undefined;
    
    // Validación de permisos
    const isAllowed = 
        (myRole === 'store' && order.storeId === userProfile?.storeId) ||
        (myRole === 'delivery' && order.deliveryPersonId === myUser?.uid) ||
        (myUser?.uid === order.userId); 

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // --- LÓGICA DE DESTINATARIO Y NOTIFICACIÓN ---
    const getRecipientInfo = () => {
        // 1. Si soy CLIENTE:
        if (myUser?.uid === order.userId) {
            // Si hay delivery asignado y está en camino -> Hablo con Delivery
            if (order.deliveryPersonId && ['En reparto', 'En camino'].includes(order.status)) {
                return { id: order.deliveryPersonId, role: 'delivery' as const, name: 'Repartidor' };
            }
            // Si no, hablo con la Tienda (Owner)
            // ✅ CORRECCIÓN AQUÍ: Usamos (order as any) para evitar el error de TypeScript
            return { id: (order as any).storeOwnerId, role: 'store' as const, name: order.storeName };
        }
        
        // 2. Si soy TIENDA o DELIVERY -> Hablo con el Cliente
        return { id: order.userId, role: 'buyer' as const, name: order.customerName };
    };

    const handleSend = async (e?: React.FormEvent, textToSend?: string) => {
        if (e) e.preventDefault();
        const text = textToSend || newMessage;

        if (!myUser || !userProfile || !text.trim() || !isAllowed || isSending || !firestore) return;
        
        setIsSending(true);
        try {
            // A. Guardar mensaje en Firestore
            const messageData = {
                senderId: myUser.uid,
                senderName: userProfile.displayName || userProfile.name || 'Usuario',
                senderRole: myRole || 'buyer', 
                text: text.trim(),
                createdAt: serverTimestamp(),
            };
            
            await addDoc(collection(firestore, 'order_chats', order.id, 'messages'), messageData);

            // B. ENVIAR NOTIFICACIÓN (La Campanita 🔔)
            const recipient = getRecipientInfo();
            
            // Solo notificamos si encontramos un ID válido
            if (recipient.id) { 
                await OrderService.sendNotification(
                    firestore,
                    recipient.id,
                    `💬 Nuevo mensaje de ${messageData.senderName}`,
                    text.trim(), 
                    recipient.role,
                    order.id
                );
            }

            setNewMessage('');
        } catch (error) {
            console.error("Error al enviar mensaje:", error);
        } finally {
            setIsSending(false);
        }
    };

    if (!isAllowed) return null;

    // --- TÍTULOS DINÁMICOS ---
    let chatTitle = "Chat del Pedido";
    let ChatIcon = MessageSquare;
    let chatSubtitle = "";

    if (myRole === 'store') {
        chatTitle = `Chat con Cliente: ${order.customerName}`;
        ChatIcon = User;
        chatSubtitle = "Responde dudas sobre el pedido";
    } else if (myRole === 'delivery') {
        chatTitle = `Chat con Cliente: ${order.customerName}`;
        ChatIcon = User;
        chatSubtitle = "Coordina la entrega";
    } else {
        // Soy Cliente
        const recipient = getRecipientInfo();
        if (recipient.role === 'delivery') {
            chatTitle = "Chat con Repartidor";
            ChatIcon = Bike;
            chatSubtitle = "Tu pedido está en camino";
        } else {
            chatTitle = `Chat con ${order.storeName}`;
            ChatIcon = Store;
            chatSubtitle = "Consulta sobre tu pedido";
        }
    }

    const MessageBubble = ({ message }: { message: ChatMessage }) => {
        const isMine = message.senderId === myUser?.uid;
        
        let roleColor = "text-gray-600";
        let roleLabel = "Usuario";
        
        if (message.senderRole === 'store') { roleColor = "text-blue-700 font-bold"; roleLabel = "Tienda"; }
        else if (message.senderRole === 'delivery') { roleColor = "text-green-700 font-bold"; roleLabel = "Repartidor"; }
        else if (message.senderRole === 'buyer') { roleColor = "text-orange-700 font-bold"; roleLabel = "Cliente"; }

        return (
            <div className={cn("flex w-full", isMine ? "justify-end" : "justify-start")}>
                <div 
                    className={cn(
                        "max-w-[85%] p-3 rounded-xl shadow-sm border text-sm",
                        isMine 
                            ? "bg-blue-600 text-white rounded-br-none border-blue-700" 
                            : "bg-white text-slate-900 rounded-bl-none border-gray-200"
                    )}
                >
                    {!isMine && (
                         <p className={cn("text-[10px] uppercase mb-1 flex items-center gap-1", roleColor)}>
                            {message.senderRole === 'store' && <Store className="h-3 w-3"/>}
                            {message.senderRole === 'delivery' && <Bike className="h-3 w-3"/>}
                            {message.senderRole === 'buyer' && <User className="h-3 w-3"/>}
                            {roleLabel}
                        </p>
                    )}
                    <p className="break-words leading-relaxed">{message.text}</p>
                    <p className={cn("text-[9px] mt-1 opacity-70", isMine ? "text-blue-100 text-right" : "text-gray-400 text-left")}>
                        {message.createdAt && typeof (message.createdAt as any).toDate === 'function' 
                            ? format((message.createdAt as any).toDate(), 'HH:mm', { locale: es })
                            : '...'}
                    </p>
                </div>
            </div>
        );
    };

    const currentReplies = myRole && QUICK_REPLIES[myRole] ? QUICK_REPLIES[myRole] : QUICK_REPLIES['buyer'];

    return (
        <Card className="h-[500px] flex flex-col shadow-md border-t-4 border-t-primary bg-card text-card-foreground">
            <CardHeader className="p-3 border-b bg-muted/20">
                <CardTitle className="text-base flex items-center gap-2">
                    <ChatIcon className="h-5 w-5 text-primary" />
                    {chatTitle}
                </CardTitle>
                <CardDescription className="text-xs">
                    {chatSubtitle}
                </CardDescription>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-100 dark:bg-slate-900">
                {loadingMessages ? (
                    <div className="text-center py-10">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    messages?.map(msg => <MessageBubble key={msg.id} message={msg} />)
                )}
                {messages?.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-sm italic">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20"/>
                        <p>Inicia la conversación</p>
                        <p className="text-xs opacity-70">Los mensajes enviarán una notificación 🔔</p>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </CardContent>

            <CardFooter className="p-3 border-t bg-background flex-col gap-2 items-start">
                <div className="flex flex-wrap gap-2 w-full overflow-x-auto pb-1 no-scrollbar">
                    {currentReplies.map((reply, index) => (
                        <Badge 
                            key={index} 
                            variant="outline" 
                            className="cursor-pointer hover:bg-primary hover:text-white transition-colors py-1 px-2 text-[10px] font-normal shrink-0 border-primary/20"
                            onClick={() => handleSend(undefined, reply)}
                        >
                            {reply}
                        </Badge>
                    ))}
                </div>

                <form onSubmit={handleSend} className="flex w-full space-x-2">
                    <Input
                        className="flex-1 h-9 text-sm bg-background text-foreground"
                        type="text"
                        placeholder="Escribe aquí..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        disabled={isSending}
                    />
                    <Button type="submit" size="icon" className="h-9 w-9" disabled={isSending}>
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </form>
            </CardFooter>
        </Card>
    );
}