'use client';

import { useState } from 'react';
import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/auth-context';
import { useCollection, useFirestore, useMemoFirebase } from '@/lib/firebase';
import { collection, query, where } from 'firebase/firestore';
import { authedFetch } from '@/lib/authed-fetch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Bell, Send } from 'lucide-react';

function AdminCommunicationsPage() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const usersQuery = useMemoFirebase(() => firestore ? query(collection(firestore, 'users'), where('role', '!=', 'admin')) : null, [firestore]);
  const { data: users } = useCollection<any>(usersQuery);

  const [target, setTarget] = useState<'all' | 'stores' | 'drivers' | 'user'>('all');
  const [userId, setUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!user || !title.trim() || !body.trim()) return;
    const dest = target === 'user' ? `user:${userId}` : target;
    if (target === 'user' && !userId) {
      toast({ variant: 'destructive', title: 'Seleccioná un usuario destino' });
      return;
    }
    const label = target === 'all' ? 'todos' : target === 'stores' ? 'todas las tiendas' : target === 'drivers' ? 'todos los repartidores' : 'este usuario';
    if (!confirm(`¿Enviar notificación a "${label}"?`)) return;
    setSending(true);
    try {
      const res = await authedFetch('/api/admin/notify-broadcast', user, { target: dest, title, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: 'Notificación enviada', description: `${data.notified} destinatarios, ${data.sent} push.` });
      setTitle(''); setBody('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error al enviar', description: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container mx-auto pb-20 space-y-6 max-w-2xl">
      <PageHeader title="Comunicaciones" description="Enviar notificaciones a los usuarios de la plataforma." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /> Nueva notificación</CardTitle>
          <CardDescription>Se envía como push + campanita in-app. Máximo 5 envíos por hora.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Destino</label>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'stores', 'drivers', 'user'] as const).map(t => (
                <button key={t} onClick={() => setTarget(t)}
                  className={cn('px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                    target === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  )}>
                  {t === 'all' ? 'Todos' : t === 'stores' ? 'Todas las tiendas' : t === 'drivers' ? 'Todos los repartidores' : 'Un usuario'}
                </button>
              ))}
            </div>
            {target === 'user' && (
              <div className="space-y-2">
                <Input placeholder="Buscar usuario por nombre o email..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                {userSearch.trim() && (
                  <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                    {(users || []).filter(u =>
                      u.displayName?.toLowerCase().includes(userSearch.toLowerCase()) ||
                      u.email?.toLowerCase().includes(userSearch.toLowerCase())
                    ).slice(0, 8).map((u: any) => (
                      <button key={u.id} className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors',
                        userId === u.id ? 'bg-primary/10 font-medium' : ''
                      )} onClick={() => { setUserId(u.id); setUserSearch(u.displayName || u.email || ''); }}>
                        {u.displayName || u.name || '(sin nombre)'} — {u.email}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Título <span className="text-muted-foreground">({title.length}/60)</span></label>
            <Input maxLength={60} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Actualización importante" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Mensaje <span className="text-muted-foreground">({body.length}/160)</span></label>
            <Textarea maxLength={160} value={body} onChange={e => setBody(e.target.value)} placeholder="Ej: Hoy operamos con horario reducido hasta las 20hs." rows={3} />
          </div>

          <Button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()} className="gap-2">
            {sending ? <><span className="animate-spin">⋯</span> Enviando...</> : <><Send className="h-4 w-4" /> Enviar notificación</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminCommunicationsPageGuarded() {
  return <AdminAuthGuard><AdminCommunicationsPage /></AdminAuthGuard>;
}
