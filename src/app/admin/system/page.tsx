'use client';

import Link from 'next/link';
import { collection, doc, limit, orderBy, query } from 'firebase/firestore';
import { Activity, ScrollText, Settings2, Wrench } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { db, useCollection, useDoc, useMemoFirebase } from '@/lib/firebase';
import { fmtDate } from '@/lib/format-date';
import { Button } from '@/components/ui/button';
import { AdminPage } from '@/components/admin/admin-page';
import { KpiCard, KpiRow } from '@/components/admin/kpi-card';
import { ErrorState } from '@/components/admin/error-state';

/**
 * Salud del sistema (NUEVA — versión MÍNIMA en T1 para que el menú final y el chip de la
 * topbar no apunten a un 404; la pantalla completa es de T5: switch de mantenimiento con
 * confirmación, liquidación semanal con historial, índices faltantes capturados, push, cuotas).
 * Lecturas: 1 doc de config + 1 corrida de conciliación.
 */
export default function AdminSystemPage() {
  const { isAdmin, isFullAdmin } = useAuth();
  const configRef = useMemoFirebase(() => (isAdmin ? doc(db, 'config', 'platform') : null), [isAdmin]);
  const { data: config, isLoading: cfgLoading, error: cfgError } = useDoc<{ maintenanceMode?: boolean; settlementDayOfWeek?: number; serviceFee?: number; deliveryFee?: number; defaultCommissionRate?: number }>(configRef);
  const lastReconQ = useMemoFirebase(() => (isAdmin ? query(collection(db, 'reconciliations'), orderBy('finishedAt', 'desc'), limit(1)) : null), [isAdmin]);
  const { data: recon, error: reconError } = useCollection<Record<string, unknown>>(lastReconQ);
  const last = recon?.[0];
  const maintenance = config?.maintenanceMode === true;
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;

  return (
    <AdminPage title="Salud del sistema" subtitle="Estado operativo de la plataforma de un vistazo." crumbs={[{ label: 'Sistema' }, { label: 'Salud del sistema' }]}>
      {cfgError && <ErrorState compact error={cfgError} />}
      <KpiRow cols={4}>
        <KpiCard testId="kpi-maintenance" label="Mantenimiento" value={cfgLoading ? null : maintenance ? 'ACTIVO' : 'Apagado'} format="text" tone={maintenance ? 'warning' : 'success'}
          hint={maintenance ? 'nadie puede hacer pedidos ahora' : 'la plataforma acepta pedidos'} href={isFullAdmin ? '/admin/settings' : undefined} />
        <KpiCard label="Última conciliación con MP" value={last ? fmtDate(last.finishedAt ?? last.startedAt, 'long') : recon === null ? null : 'sin corridas'} format="text" error={reconError}
          hint={last ? `${String(last.source ?? 'cron')} · ${Number(last.checkedOrders ?? 0)} revisados · ${Number(last.repaired ?? 0)} reparados · ${Number(last.flagged ?? 0)} marcados` : 'corre a diario 13:30 UTC'} href="/admin/payment-issues" />
        <KpiCard label="Liquidación semanal" value={cfgLoading ? null : `los ${DAYS[config?.settlementDayOfWeek ?? 5] ?? 'viernes'}`} format="text" hint="14:00 UTC · genera solicitudes, no transfiere" href={isFullAdmin ? '/admin/finances/payouts' : undefined} />
        <KpiCard label="Versión desplegada" value={sha ? sha.slice(0, 7) : 'local'} format="text" hint={sha ? 'commit de Vercel' : 'dev server'} />
      </KpiRow>

      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Activity className="h-4 w-4" aria-hidden="true" /> Configuración vigente</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Tarifa de servicio</dt><dd className="tabular-nums">{config?.serviceFee ?? '—'} %</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Envío base</dt><dd className="tabular-nums">${(config?.deliveryFee ?? 0).toLocaleString('es-AR')}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Comisión por defecto</dt><dd className="tabular-nums">{config?.defaultCommissionRate ?? '—'} %</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Modo mantenimiento</dt><dd className={maintenance ? 'font-medium text-warning-ink' : ''}>{maintenance ? 'activo' : 'apagado'}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {isFullAdmin && <Button asChild variant="outline" size="sm" className="h-9 gap-1.5"><Link href="/admin/settings"><Settings2 className="h-4 w-4" aria-hidden="true" /> Configuración</Link></Button>}
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5"><Link href="/admin/audit-log"><ScrollText className="h-4 w-4" aria-hidden="true" /> Auditoría</Link></Button>
          {isFullAdmin && maintenance && <Button asChild size="sm" className="h-9 gap-1.5"><Link href="/admin/settings"><Wrench className="h-4 w-4" aria-hidden="true" /> Apagar mantenimiento</Link></Button>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Versión mínima (T1). En T5: switch de mantenimiento con confirmación acá mismo, historial de la liquidación semanal, índices faltantes detectados en esta sesión, dispositivos con push y cuotas en vigor.</p>
      </section>
    </AdminPage>
  );
}
