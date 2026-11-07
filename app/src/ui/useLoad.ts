import { useCallback, useEffect, useRef, useState } from 'react';

import { SignedOutError } from '../api/errors';

/** Loads data for a screen and exposes loading, refreshing and error state. */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const run = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      try {
        const result = await load();
        if (!mounted.current) return;
        setData(result);
        setError(null);
      } catch (e) {
        // A signed-out error sends the user to sign-in; nothing to show here.
        if (mounted.current && !(e instanceof SignedOutError)) setError((e as Error).message);
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [load],
  );

  return { data, error, loading, refreshing, reload: run };
}
