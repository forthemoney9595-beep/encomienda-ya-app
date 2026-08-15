import {
  getAggregateFromServer,
  getCountFromServer,
  type AggregateSpec,
  type AggregateField,
  type Query,
  type CollectionReference,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

// Helpers para aggregation queries (count/sum/average) de Firestore.
//
// A diferencia de useCollection (que usa onSnapshot y es en tiempo real), estas consultas son
// de una sola vez: Firestore calcula el agregado en su servidor y devuelve solo el número, sin
// bajar los documentos. Se facturan ~1 lectura cada 1000 docs que matchean, así que reemplazan
// el patrón caro de "bajar la colección entera y sumar/contar en el cliente".
//
// Como son one-shot, exponen refresh() para volver a correrlas, y opcionalmente refrescan solas
// cuando la pestaña/ventana vuelve a tomar foco (refreshOnFocus) — así los totales se sienten
// "vivos" sin mantener un listener permanente.

type AggregateOptions = { refreshOnFocus?: boolean };

// Suscribe focus/visibilitychange para re-correr `run` al volver a la pestaña (si enabled).
function useFocusRefresh(run: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const onFocus = () => {
      if (document.visibilityState === 'visible') run();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [run, enabled]);
}

type AggregateData<T extends AggregateSpec> = {
  [K in keyof T]: T[K] extends AggregateField<infer R> ? R : never;
};

/**
 * Corre una aggregation query (sum/count/average) y devuelve { data, isLoading, refresh }.
 * `queryRef` debe venir memoizado por el llamador (useMemoFirebase) para que refresh sea estable.
 * El `spec` se lee vía ref para no forzar dependencias inestables.
 */
export function useAggregate<T extends AggregateSpec>(
  queryRef: Query | CollectionReference | null,
  spec: T,
  opts: AggregateOptions = {}
) {
  const [data, setData] = useState<AggregateData<T> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const specRef = useRef(spec);
  specRef.current = spec;

  const run = useCallback(async () => {
    if (!queryRef) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const snap = await getAggregateFromServer(queryRef, specRef.current);
      setData(snap.data() as AggregateData<T>);
      setError(null);
    } catch (err: any) {
      // ANTES esto era un console.error suelto: la query fallaba, `data` quedaba en null y
      // la UI mostraba 0 en TODAS las métricas sin ninguna pista de que algo se había roto.
      // Pasó de verdad al agregar sum('serviceFee') a una aggregation que ya sumaba
      // 'total': Firestore exige un índice que cubra el filtro MÁS todos los campos
      // agregados a la vez, y sin él devuelve failed-precondition. Ahora el error se
      // expone (para que la UI pueda distinguir "0" de "falló") y se reporta a Sentry.
      console.error('[useAggregate] La consulta falló:', err);
      setError(err);
      Sentry.captureException(err, {
        tags: { area: 'firebase-aggregate', code: err?.code ?? 'unknown' },
        extra: { fields: Object.keys(specRef.current) },
      });
    } finally {
      setIsLoading(false);
    }
  }, [queryRef]);

  useEffect(() => {
    run();
  }, [run]);

  useFocusRefresh(run, !!opts.refreshOnFocus);

  return { data, isLoading, error, refresh: run };
}

/**
 * Cuenta documentos server-side. Devuelve { count, isLoading, refresh }.
 * `queryRef` debe venir memoizado por el llamador.
 */
export function useCountFromServer(
  queryRef: Query | CollectionReference | null,
  opts: AggregateOptions = {}
) {
  const [count, setCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async () => {
    if (!queryRef) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const snap = await getCountFromServer(queryRef);
      setCount(snap.data().count);
      setError(null);
    } catch (err: any) {
      // Mismo criterio que useAggregate: un count que falla mostraba 0 en silencio.
      // Tanda B: además del reporte a Sentry, el error se EXPONE (useAggregate ya lo
      // hacía; este hook no, y el consumidor no podía distinguir "0" de "falló").
      console.error('[useCountFromServer] La consulta falló:', err);
      Sentry.captureException(err, { tags: { area: 'firebase-aggregate', code: err?.code ?? 'unknown' } });
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [queryRef]);

  useEffect(() => {
    run();
  }, [run]);

  useFocusRefresh(run, !!opts.refreshOnFocus);

  return { count, isLoading, error, refresh: run };
}
