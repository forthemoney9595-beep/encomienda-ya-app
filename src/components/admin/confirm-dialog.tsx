'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * ConfirmDialog / useConfirm — reemplaza los confirm()/prompt() nativos del panel.
 *
 *   const confirm = useConfirm();
 *   const { ok, values } = await confirm({ title: '¿Cancelar el pedido?', tone: 'destructive',
 *     fields: [{ key: 'reason', label: 'Motivo', type: 'textarea' }] });
 *
 * `requireText` obliga a escribir una palabra exacta (ej. "ELIMINAR") antes de habilitar.
 * Los campos `required` o con `min` bloquean el botón hasta cumplirse. Nunca se resuelve dos
 * veces y cerrar el diálogo equivale a cancelar.
 */
export interface ConfirmField {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'money' | 'number';
  required?: boolean;
  /** Mínimo de caracteres (text/textarea) o valor mínimo (money/number). */
  min?: number;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
}

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  tone?: 'default' | 'destructive';
  confirmLabel?: string;
  cancelLabel?: string;
  requireText?: string;
  fields?: ConfirmField[];
  /** Si viene, el botón queda en spinner hasta que la promesa termine; si lanza, el diálogo queda abierto y muestra el error. */
  onConfirm?: (values: Record<string, string>) => Promise<void>;
}

export type ConfirmResult = { ok: boolean; values: Record<string, string> };
type ConfirmFn = (opts: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider> (lo monta AdminShell).');
  return fn;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolverRef = useRef<((r: ConfirmResult) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    // Si había uno abierto, se cancela (no se apilan).
    resolverRef.current?.({ ok: false, values: {} });
    const initial: Record<string, string> = {};
    (o.fields ?? []).forEach(f => { initial[f.key] = f.defaultValue ?? ''; });
    setValues(initial);
    setTyped('');
    setError(null);
    setBusy(false);
    setOpts(o);
    return new Promise<ConfirmResult>((resolve) => { resolverRef.current = resolve; });
  }, []);

  const finish = useCallback((r: ConfirmResult) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOpts(null);
    resolve?.(r);
  }, []);

  const fieldOk = (f: ConfirmField, v: string): boolean => {
    const t = (v ?? '').trim();
    if (f.type === 'money' || f.type === 'number') {
      const n = Number(t);
      if (f.required && t === '') return false;
      if (t !== '' && !Number.isFinite(n)) return false;
      if (typeof f.min === 'number' && t !== '' && n < f.min) return false;
      return true;
    }
    if (f.required && t.length === 0) return false;
    if (typeof f.min === 'number' && t.length < f.min) return false;
    return true;
  };

  const canConfirm = useMemo(() => {
    if (!opts) return false;
    if (opts.requireText && typed.trim() !== opts.requireText) return false;
    return (opts.fields ?? []).every(f => fieldOk(f, values[f.key] ?? ''));
  }, [opts, typed, values]);

  const handleConfirm = async () => {
    if (!opts || !canConfirm) return;
    const out: Record<string, string> = {};
    Object.entries(values).forEach(([k, v]) => { out[k] = (v ?? '').trim(); });
    if (opts.onConfirm) {
      setBusy(true);
      setError(null);
      try {
        await opts.onConfirm(out);
      } catch (e: unknown) {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
      setBusy(false);
    }
    finish({ ok: true, values: out });
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onOpenChange={(open) => { if (!open && !busy) finish({ ok: false, values: {} }); }}>
        {opts && (
          <DialogContent className="sm:max-w-md" data-testid="confirm-dialog">
            <DialogHeader>
              <DialogTitle>{opts.title}</DialogTitle>
              {opts.description ? <DialogDescription asChild><div className="text-sm text-muted-foreground">{opts.description}</div></DialogDescription> : null}
            </DialogHeader>

            {(opts.fields?.length || opts.requireText) ? (
              <div className="space-y-3 py-1">
                {(opts.fields ?? []).map(f => {
                  const id = `confirm-field-${f.key}`;
                  const v = values[f.key] ?? '';
                  const invalid = v.trim() !== '' && !fieldOk(f, v);
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={id}>{f.label}{f.required || (f.min ?? 0) > 0 ? ' *' : ''}</Label>
                      {f.type === 'textarea' ? (
                        <Textarea id={id} rows={3} value={v} placeholder={f.placeholder} aria-invalid={invalid || undefined}
                          onChange={e => setValues(s => ({ ...s, [f.key]: e.target.value }))} />
                      ) : (
                        <Input id={id} type={f.type === 'money' || f.type === 'number' ? 'number' : 'text'} inputMode={f.type === 'money' || f.type === 'number' ? 'decimal' : undefined}
                          value={v} placeholder={f.placeholder} aria-invalid={invalid || undefined}
                          onChange={e => setValues(s => ({ ...s, [f.key]: e.target.value }))} />
                      )}
                      {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                    </div>
                  );
                })}
                {opts.requireText && (
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-require-text">Escribí <span className="font-mono font-semibold">{opts.requireText}</span> para confirmar</Label>
                    <Input id="confirm-require-text" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
                  </div>
                )}
              </div>
            ) : null}

            {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-ink">{error}</p>}

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => finish({ ok: false, values: {} })} disabled={busy}>
                {opts.cancelLabel ?? 'Cancelar'}
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm || busy}
                className={cn('gap-1.5', opts.tone === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}
                data-testid="confirm-accept"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {opts.confirmLabel ?? 'Confirmar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
