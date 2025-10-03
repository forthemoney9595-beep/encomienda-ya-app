import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import ChatList from './chat-list';

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
