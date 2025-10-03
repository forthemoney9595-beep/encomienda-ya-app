
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import { getUserChats, type ChatPreview } from '@/lib/chat-service';

function ChatListSkeleton() {
    return (
        <div className="space-y-4 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <div className="flex justify-between">
                            <Skeleton className="h-4 w-2/4" />
                            <Skeleton className="h-3 w-1/4" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                    </div>
                </div>
            ))}
        </div>
    )
}

export default function ChatList() {
    const { user, loading: authLoading } = useAuth();
    const [chats, setChats] = useState<ChatPreview[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setLoading(false);
            return;
        }

        async function fetchChats() {
            setLoading(true);
            const userChats = await getUserChats(user!.uid);
            setChats(userChats);
            setLoading(false);
        }

        fetchChats();
    }, [user, authLoading]);

    if (loading || authLoading) {
        return <ChatListSkeleton />;
    }

    if (!user) {
        return (
             <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                <p>Inicia sesión para ver tus chats.</p>
            </div>
        )
    }

    if (chats.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                <p>No tienes conversaciones. <br/> Inicia una desde la página de una tienda.</p>
            </div>
        );
    }
    
    return (
        <nav className="flex flex-col">
            <ul className="flex flex-col gap-1">
                 {chats.map(chat => (
                    <li key={chat.id}>
                         <Link href={`/chat/${chat.id}`}>
                             <div className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted">
                                <Avatar className="h-12 w-12 border">
                                    <AvatarImage src={chat.otherParticipant.imageUrl} alt={chat.otherParticipant.name} />
                                    <AvatarFallback>{chat.otherParticipant.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 overflow-hidden">
                                    <div className="flex items-center justify-between">
                                        <p className="font-semibold truncate">{chat.otherParticipant.name}</p>
                                        {chat.lastMessageTimestamp && (
                                            <p className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(chat.lastMessageTimestamp, { addSuffix: true, locale: es })}
                                            </p>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground truncate">
                                        {chat.lastMessage}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    </li>
                 ))}
            </ul>
        </nav>
    );
}
