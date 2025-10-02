
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
import { usePrototypeData } from '@/context/prototype-data-context';

export function Notifications() {
  const { prototypeNotifications } = usePrototypeData();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full">
          <Bell className="h-5 w-5" />
          {prototypeNotifications.length > 0 && (
            <Badge className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full p-1 text-xs">
              {prototypeNotifications.length}
            </Badge>
          )}
          <span className="sr-only">Ver notificaciones</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {prototypeNotifications.length === 0 ? (
          <DropdownMenuItem disabled>No hay notificaciones nuevas.</DropdownMenuItem>
        ) : (
          prototypeNotifications.map((notification) => (
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
         <DropdownMenuSeparator />
         <DropdownMenuItem className='justify-center text-sm text-muted-foreground hover:cursor-pointer'>
            Marcar todas como leídas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
