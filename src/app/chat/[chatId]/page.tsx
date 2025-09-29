import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SendHorizonal } from "lucide-react";

export default function ChatRoomPage({ params }: { params: { chatId: string } }) {

    // In a real app, you would fetch chat details and messages based on params.chatId
    const chatPartner = {
        name: "Nombre de la Tienda",
        avatarUrl: `https://picsum.photos/seed/${params.chatId}/40/40`
    };

    return (
        <div className="flex h-full flex-col">
            <header className="flex items-center gap-4 border-b p-4">
                <Avatar className="border">
                    <AvatarImage src={chatPartner.avatarUrl} alt={chatPartner.name} />
                    <AvatarFallback>{chatPartner.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <h2 className="text-lg font-semibold">{chatPartner.name}</h2>
            </header>

            <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                    <div className="p-4 space-y-4">
                        {/* Placeholder for messages */}
                        <div className="flex items-end gap-2">
                            <Avatar className="h-8 w-8 border">
                                <AvatarImage src={chatPartner.avatarUrl} />
                                <AvatarFallback>{chatPartner.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="max-w-xs rounded-lg bg-muted p-3 text-sm">
                                <p>Hola, ¿en qué puedo ayudarte?</p>
                            </div>
                        </div>
                        <div className="flex items-end gap-2 justify-end">
                            <div className="max-w-xs rounded-lg bg-primary text-primary-foreground p-3 text-sm">
                                <p>¡Hola! Me gustaría hacer un pedido personalizado.</p>
                            </div>
                             <Avatar className="h-8 w-8 border">
                                <AvatarFallback>T</AvatarFallback>
                            </Avatar>
                        </div>
                         <div className="flex items-end gap-2">
                            <Avatar className="h-8 w-8 border">
                                <AvatarImage src={chatPartner.avatarUrl} />
                                <AvatarFallback>{chatPartner.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="max-w-xs rounded-lg bg-muted p-3 text-sm">
                                <p>¡Claro! Dime qué necesitas.</p>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </div>

            <footer className="border-t p-4">
                <div className="relative">
                    <Input placeholder="Escribe un mensaje..." className="pr-12 text-base" />
                    <Button type="submit" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8">
                        <SendHorizonal className="h-4 w-4" />
                        <span className="sr-only">Enviar mensaje</span>
                    </Button>
                </div>
            </footer>
        </div>
    );
}
