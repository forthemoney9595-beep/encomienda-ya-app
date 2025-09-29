import { MessageCircle } from "lucide-react";

export default function ChatPage() {
    return (
        <div className="hidden h-full flex-col items-center justify-center bg-background md:flex">
            <MessageCircle className="h-16 w-16 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold text-muted-foreground">Selecciona un chat</h2>
            <p className="text-muted-foreground">Elige una conversación de la lista para ver los mensajes.</p>
        </div>
    );
}
