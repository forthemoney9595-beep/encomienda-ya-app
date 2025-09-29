import Link from 'next/link';
import { getUserChats } from '@/lib/chat-service';
import { auth } from '@/lib/firebase'; // Assuming you export auth
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { redirect } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

async function ChatList() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        // This should be handled by middleware or page-level checks as well,
        // but it's a good safeguard.
        return null;
    }
    const chats = await getUserChats(currentUser.uid);

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

export default function ChatLayout({ children }: { children: React.ReactNode }) {
    // Note: In a real app, you would get the current user's ID securely.
    // Here we assume a function `getCurrentUserId` exists. For now, we'll
    // just build the layout.

    return (
        <div className="grid h-[calc(100vh-8rem)] grid-cols-1 md:grid-cols-3 lg:grid-cols-4">
            <div className="hidden md:flex flex-col border-r">
                <div className="p-4 border-b">
                    <h1 className="text-xl font-bold">Conversaciones</h1>
                </div>
                <ScrollArea className="flex-1">
                    <Suspense fallback={<ChatListSkeleton />}>
                        <ChatList />
                    </Suspense>
                </ScrollArea>
            </div>
            <div className="col-span-1 md:col-span-2 lg:col-span-3">
                {children}
            </div>
        </div>
    );
}
