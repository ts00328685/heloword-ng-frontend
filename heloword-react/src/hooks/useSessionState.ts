import { Dispatch, SetStateAction, useEffect, useState } from 'react';

const PREFIX = 'hw-state:';

export interface Codec<T> {
  encode: (v: T) => unknown;
  decode: (raw: unknown) => T;
}

/** Codec for Set<string>, which JSON can't represent directly. */
export const setCodec: Codec<Set<string>> = {
  encode: (v) => [...v],
  decode: (raw) => new Set(Array.isArray(raw) ? (raw as string[]) : []),
};

function storageFor(kind: 'session' | 'local'): Storage | null {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null; // storage blocked (private mode, sandbox)
  }
}

/** Read a value saved by useSessionState without subscribing to it. */
export function readSessionState<T>(key: string, kind: 'session' | 'local' = 'session'): T | undefined {
  try {
    const raw = storageFor(kind)?.getItem(PREFIX + key);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

/**
 * useState that survives leaving the page (and reloads in the same tab).
 *
 * Practice games use it so stepping away — to log in, change audio, check
 * another page — brings you back to the same question instead of a new one.
 * `kind: 'local'` keeps the value across visits (for preferences).
 */
export function useSessionState<T>(
  key: string,
  initial: T | (() => T),
  options: { kind?: 'session' | 'local'; codec?: Codec<T> } = {},
): [T, Dispatch<SetStateAction<T>>] {
  const { kind = 'session', codec } = options;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = storageFor(kind)?.getItem(PREFIX + key);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        return codec ? codec.decode(parsed) : (parsed as T);
      }
    } catch {}
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    try {
      storageFor(kind)?.setItem(PREFIX + key, JSON.stringify(codec ? codec.encode(value) : value));
    } catch {}
  }, [key, kind, value]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue];
}
