'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Bell, BellRing } from 'lucide-react';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useState } from 'react';

type Notification = {
  id: string;
  title: string;
  description: string;
  date: string;
}

const initialNotifications: Notification[] = [
    { id: 'n1', title: '¡Bienvenido!', description: 'Gracias por unirte a EncomiendaYA.', date: 'hace 1 día' },
];

export function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);

  const clearNotifications = () => {
    setNotifications([]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full">
          <Bell className="h-5 w-5" />
          {notifications.length > 0 && (
            <Badge className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full p-1 text-xs">
              {notifications.length}
            </Badge>
          )}
          <span className="sr-only">Ver notificaciones</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <DropdownMenuItem disabled>No hay notificaciones nuevas.</DropdownMenuItem>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem key={notification.id} className="flex flex-col items-start gap-1 whitespace-normal">
                <div className="flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-muted-foreground" />
                    <p className='font-semibold'>{notification.title}</p>
                </div>
                <p className='pl-6 text-sm text-muted-foreground'>{notification.description}</p>
                <p className='pl-6 text-xs text-muted-foreground/70'>{notification.date}</p>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
         <DropdownMenuSeparator />
         <DropdownMenuItem onClick={clearNotifications} className='justify-center text-sm text-muted-foreground hover:cursor-pointer'>
            Marcar todas como leídas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
