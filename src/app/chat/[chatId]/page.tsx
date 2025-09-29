'use client';

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SendHorizonal, Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useChat } from "@/hooks/use-chat";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useRef } from "react";

function ChatSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-end gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-10 w-48 rounded-lg" />
      </div>
      <div className="flex items-end gap-2 justify-end">
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <div className="flex items-end gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-14 w-64 rounded-lg" />
      </div>
    </div>
  );
}

export default function ChatRoomPage({ params }: { params: { chatId: string } }) {
    const { user, loading: authLoading } = useAuth();
    const { messages, chatDetails, sendMessage, loading: chatLoading } = useChat(params.chatId);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Scroll to bottom when messages change
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight });
        }
    }, [messages]);


    if (authLoading || chatLoading) {
      return (
        <div className="flex h-full flex-col">
            <header className="flex items-center gap-4 border-b p-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-6 w-32" />
            </header>
            <div className="flex-1 overflow-hidden">
                <ChatSkeleton />
            </div>
             <footer className="border-t p-4">
                <div className="relative">
                    <Input placeholder="Escribe un mensaje..." className="pr-12 text-base" disabled />
                    <Button type="submit" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" disabled>
                        <SendHorizonal className="h-4 w-4" />
                    </Button>
                </div>
            </footer>
        </div>
      )
    }

    if (!user) return null; // Or a message to log in

    const chatPartner = chatDetails?.otherParticipant;

    const handleSendMessage = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const input = form.elements.namedItem('message') as HTMLInputElement;
        const text = input.value.trim();
        if (text) {
            sendMessage(text);
            form.reset();
        }
    };

    return (
        <div className="flex h-[calc(100vh-8rem)] flex-col">
            <header className="flex items-center gap-4 border-b p-4">
                <Avatar className="border">
                    <AvatarImage src={chatPartner?.imageUrl} alt={chatPartner?.name} />
                    <AvatarFallback>{chatPartner?.name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <h2 className="text-lg font-semibold">{chatPartner?.name}</h2>
            </header>

            <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full" ref={scrollAreaRef}>
                    <div className="p-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                                <p>No hay mensajes todavía. ¡Sé el primero en enviar uno!</p>
                            </div>
                        )}
                        {messages.map(message => (
                            <div key={message.id} className={`flex items-end gap-2 ${message.senderId === user.uid ? 'justify-end' : ''}`}>
                                {message.senderId !== user.uid && (
                                     <Avatar className="h-8 w-8 border">
                                        <AvatarImage src={chatPartner?.imageUrl} />
                                        <AvatarFallback>{chatPartner?.name?.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                )}
                                <div className={`max-w-xs rounded-lg p-3 text-sm ${message.senderId === user.uid ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                    <p>{message.text}</p>
                                </div>
                                {message.senderId === user.uid && (
                                     <Avatar className="h-8 w-8 border">
                                        <AvatarImage src={`https://picsum.photos/seed/${user.name}/40/40`} />
                                        <AvatarFallback>{user.name?.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            <footer className="border-t p-4">
                <form className="relative" onSubmit={handleSendMessage}>
                    <Input name="message" placeholder="Escribe un mensaje..." className="pr-12 text-base" autoComplete="off" />
                    <Button type="submit" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8">
                        <SendHorizonal className="h-4 w-4" />
                        <span className="sr-only">Enviar mensaje</span>
                    </Button>
                </form>
            </footer>
        </div>
    );
}
