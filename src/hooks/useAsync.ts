import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

import { useAppStore } from '@/store/appStore';

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

/** Runs an async loader on mount / deps change / data invalidation. Errors are surfaced, never swallowed. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const dataVersion = useAppStore((s) => s.dataVersion);
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; loading: boolean }>({ data: undefined, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: unknown) => alive && setState({ data: undefined, error: e instanceof Error ? e : new Error(String(e)), loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, dataVersion]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}
