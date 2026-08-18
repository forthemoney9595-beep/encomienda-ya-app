'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminAuthGuard from '../admin-auth-guard';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/auth-context';
import { useFirestore } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { authedFetch } from '@/lib/authed-fetch';
import { logAdminAction } from '@/lib/admin-audit';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bell, Send, History, RotateCcw, Loader2 } from 'lucide-react';

const TARGET_LABEL: Record<string, string> = {
  all: 'Todos', stores: 'Tiendas', drivers: 'Repartidores',
};
const describeTarget = (t: string) => t?.startsWith('user:') ? 'Un usuario' : (TARGET_LABEL[t] || t);
const HOURLY_LIMIT = 5;

function AdminCommunicationsPage() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [target, setTarget] = useState<'all' | 'stores' | 'drivers' | 'user'>('all');
  const [userId, setUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  // ¿A dónde lleva el aviso al tocarlo? (punto 8 de la prueba, 18/8): antes SIEMPRE iba a
  // '/' — tocar la campanita no llevaba a ningún lado útil. Ahora se elige el destino.
  const [linkKind, setLinkKind] = useState<'home' | 'orders' | 'order'>('home');
  const [linkOrderId, setLinkOrderId] = useState('');

  // Historial de envíos (Fase GG): antes esta página era solo un formulario, no había forma
  // de saber qué se había comunicado, a quién ni cuándo, ni de reenviar algo anterior.
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!firestore) return;
    setLoadingHistory(true);
    try {
      const snap = await getDocs(query(collection(firestore, 'broadcasts'), orderBy('createdAt', 'desc'), limit(20)));
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoadingHistory(false); }
  }, [firestore]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Cuántos envíos quedan de la cuota horaria. Se calcula sobre el historial real en vez de
  // adivinar: antes el límite de 5/h solo se conocía al chocar contra él (error 429).
  const sentLastHour = history.filter(h => {
    const ts = h.createdAt?.toDate ? h.createdAt.toDate() : null;
    return ts ? (Date.now() - ts.getTime()) < 3_600_000 : false;
  }).length;
  const remaining = Math.max(0, HOURLY_LIMIT - sentLastHour);

  // Buscador de usuario destino: prefijo de email server-side (antes bajaba TODA la colección
  // de usuarios solo para este picker). Debounced; solo consulta si hay término.
  useEffect(() => {
    const term = userSearch.trim().toLowerCase();
    if (!firestore || !term || target !== 'user') { setUserResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const snap = await getDocs(query(
          collection(firestore, 'users'),
          where('email', '>=', term), where('email', '<=', term + String.fromCharCode(0xf8ff)),
          orderBy('email'), limit(8),
        ));
        if (!cancelled) setUserResults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [firestore, userSearch, target]);

  const handleSend = async () => {
    if (!user || !title.trim() || !body.trim()) return;
    const dest = target === 'user' ? `user:${userId}` : target;
    if (target === 'user' && !userId) {
      toast({ variant: 'destructive', title: 'Seleccioná un usuario destino' });
      return;
    }
    const label = target === 'all' ? 'todos' : target === 'stores' ? 'todas las tiendas' : target === 'drivers' ? 'todos los repartidores' : 'este usuario';
    if (!confirm(`¿Enviar notificación a "${label}"?`)) return;
    // Destino del link al tocar el aviso.
    const link = linkKind === 'orders' ? '/orders'
      : linkKind === 'order' && linkOrderId.trim() ? `/orders/${linkOrderId.trim()}`
      : '/';
    setSending(true);
    try {
      const res = await authedFetch('/api/admin/notify-broadcast', user, { target: dest, title, body, link });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Un broadcast le llega a todos los usuarios de la plataforma -- no quedaba
      // registrado en ningún lado qué se mandó, a quién ni cuándo.
      if (firestore) logAdminAction(firestore, user.uid, 'send_broadcast', dest, `"${title}" — ${data.notified} destinatarios`);
      toast({ title: 'Notificación enviada', description: `${data.notified} destinatarios, ${data.sent} push.` });
      setTitle(''); setBody('');
      loadHistory();
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
                <Input placeholder="Buscar usuario por email (prefijo)..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                {userSearch.trim() && (
                  <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                    {userResults.map((u: any) => (
                      <button key={u.id} className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors',
                        userId === u.id ? 'bg-primary/10 font-medium' : ''
                      )} onClick={() => { setUserId(u.id); setUserSearch(u.email || u.displayName || ''); }}>
                        {u.displayName || u.name || '(sin nombre)'} — {u.email}
                      </button>
                    ))}
                    {userResults.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados para ese email.</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">¿A dónde lleva el aviso?</label>
            <div className="flex gap-2 flex-wrap">
              {([['home', 'Inicio'], ['orders', 'Sus pedidos'], ['order', 'Un pedido puntual']] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => setLinkKind(k)} type="button"
                  className={cn('px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                    linkKind === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  )}>
                  {lbl}
                </button>
              ))}
            </div>
            {linkKind === 'order' && (
              <Input placeholder="Pegá el ID del pedido (ej. para avisar de un reembolso)" value={linkOrderId} onChange={e => setLinkOrderId(e.target.value.trim())} />
            )}
            <p className="text-xs text-muted-foreground">Al tocar la notificación, el usuario va ahí. "Sus pedidos" abre la lista de cada uno.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Título <span className="text-muted-foreground">({title.length}/60)</span></label>
            <Input maxLength={60} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Actualización importante" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Mensaje <span className="text-muted-foreground">({body.length}/160)</span></label>
            <Textarea maxLength={160} value={body} onChange={e => setBody(e.target.value)} placeholder="Ej: Hoy operamos con horario reducido hasta las 20hs." rows={3} />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={handleSend} disabled={sending || !title.trim() || !body.trim() || remaining === 0} className="gap-2">
              {sending ? <><span className="animate-spin">⋯</span> Enviando...</> : <><Send className="h-4 w-4" /> Enviar notificación</>}
            </Button>
            <span className={cn('text-xs', remaining === 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
              {remaining === 0
                ? 'Alcanzaste el límite de 5 envíos por hora.'
                : `Te quedan ${remaining} de ${HOURLY_LIMIT} envíos esta hora.`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Historial de envíos ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" /> Últimos envíos
          </CardTitle>
          <CardDescription>Qué se comunicó, a quién y cuándo. Tocá &quot;Reusar&quot; para volver a cargar ese mensaje en el formulario.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingHistory && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          {!loadingHistory && history.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6 border-2 border-dashed rounded-lg">
              Todavía no se envió ninguna comunicación.
            </p>
          )}
          {history.map(h => (
            <div key={h.id} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{h.title}</span>
                  <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{describeTarget(h.target)}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{h.body}</p>
                <p className="text-[11px] text-muted-foreground">
                  {h.createdAt?.toDate ? format(h.createdAt.toDate(), "d MMM yyyy HH:mm", { locale: es }) : '—'}
                  {' · '}{h.notified ?? 0} destinatario{h.notified === 1 ? '' : 's'}
                  {typeof h.pushSent === 'number' ? ` · ${h.pushSent} push` : ''}
                </p>
              </div>
              <Button
                variant="outline" size="sm" className="shrink-0 gap-1.5"
                onClick={() => {
                  setTitle(h.title || '');
                  setBody(h.body || '');
                  if (h.target === 'all' || h.target === 'stores' || h.target === 'drivers') setTarget(h.target);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reusar
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminCommunicationsPageGuarded() {
  return <AdminAuthGuard requireFullAdmin><AdminCommunicationsPage /></AdminAuthGuard>;
}
