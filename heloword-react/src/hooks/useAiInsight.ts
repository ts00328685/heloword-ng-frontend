import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { aiErrorMessage, isAiLimitError } from '../utils/aiError';

interface AiInsightState {
  text: string;
  loading: boolean;
  error: boolean;
}

/**
 * Quota / busy / invalid-input failures are shown as the panel's text (not cached), so every
 * existing AI panel explains the limit without per-page changes. Only network/model failures
 * set `error`, which panels render with a retry button.
 */

interface UseAiInsightReturn extends AiInsightState {
  /** Fetch insight for the given key. Checks memory cache then sessionStorage before calling fetcher. */
  run: (key: string, fetcher: () => Promise<string>) => void;
  /** Bust cache for a key and re-fetch immediately. Use for retry. */
  retry: (key: string, fetcher: () => Promise<string>) => void;
  /** Clear current display state without touching the cache. */
  clear: () => void;
}

/**
 * Shared hook for all AI insight features.
 *
 * Cache hierarchy (fastest → slowest):
 *   1. In-memory Map (per component mount, survives re-renders)
 *   2. sessionStorage  (survives navigation within the tab)
 *   3. Backend call    (results stored in both layers above)
 *
 * @param namespace  Unique prefix for sessionStorage keys, e.g. "vocab:insight"
 */
export function useAiInsight(namespace: string): UseAiInsightReturn {
  const { isLoggedIn } = useAuth();
  const [state, setState] = useState<AiInsightState>({
    text: '',
    loading: false,
    error: false,
  });
  const memCache = useRef<Map<string, string>>(new Map());
  const activeKeyRef = useRef<string | null>(null);

  const sessionKey = (key: string) => `ai:${namespace}:${key}`;

  const run = useCallback(
    async (key: string, fetcher: () => Promise<string>) => {
      // 1. Memory cache
      const mem = memCache.current.get(key);
      if (mem !== undefined) {
        setState({ text: mem, loading: false, error: false });
        return;
      }

      // 2. sessionStorage cache
      try {
        const stored = sessionStorage.getItem(sessionKey(key));
        if (stored) {
          memCache.current.set(key, stored);
          setState({ text: stored, loading: false, error: false });
          return;
        }
      } catch {
        // sessionStorage unavailable (private mode, quota exceeded) — continue to fetch
      }

      // 3. Network fetch
      activeKeyRef.current = key;
      setState({ text: '', loading: true, error: false });
      try {
        const result = await fetcher();
        if (activeKeyRef.current !== key) return; // stale — a newer request took over
        memCache.current.set(key, result);
        try { sessionStorage.setItem(sessionKey(key), result); } catch { /* ignore quota errors */ }
        setState({ text: result, loading: false, error: false });
      } catch (e) {
        if (activeKeyRef.current !== key) return;
        if (isAiLimitError(e) || (e as Error)?.message === 'AI_BUSY') {
          setState({ text: `⚠️ ${aiErrorMessage(e, isLoggedIn)}`, loading: false, error: false });
        } else {
          setState({ text: '', loading: false, error: true });
        }
      }
    },
    [namespace, isLoggedIn], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const retry = useCallback(
    (key: string, fetcher: () => Promise<string>) => {
      memCache.current.delete(key);
      try { sessionStorage.removeItem(sessionKey(key)); } catch { /* ignore */ }
      run(key, fetcher);
    },
    [run, namespace], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const clear = useCallback(() => {
    setState({ text: '', loading: false, error: false });
  }, []);

  return { ...state, run, retry, clear };
}
