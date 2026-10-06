import React, { useEffect, useState } from 'react';

const PREFIX = 'hw-vocal-';

/** `100` → `number`, so the state isn't stuck at the default's literal type. */
type Widen<T> = T extends number ? number : T extends boolean ? boolean : never;

/**
 * useState backed by localStorage (key `hw-vocal-<key>`). Falls back to the
 * default when storage is unavailable or the stored value has the wrong type
 * or fails `isValid`.
 */
export function usePersistedState<D extends number | boolean>(
  key: string,
  defaultValue: D,
  isValid?: (v: Widen<D>) => boolean,
): readonly [Widen<D>, React.Dispatch<React.SetStateAction<Widen<D>>>];
export function usePersistedState<T extends number | boolean>(
  key: string,
  defaultValue: T,
  isValid: (v: T) => boolean = () => true,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return defaultValue;
      const parsed = JSON.parse(raw);
      return typeof parsed === typeof defaultValue && isValid(parsed) ? parsed : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Private mode / quota — settings just won't persist.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
