import { useCallback, useRef, useState } from 'react';

/**
 * An Enter arriving this soon after compositionend is the one that confirmed the
 * IME candidate, not a deliberate submit. iOS Safari fires compositionend just
 * *before* that keydown reaches us, so isComposing is already false by then and
 * only a time window can tell the two apart.
 */
const IME_ENTER_GRACE_MS = 120;

export interface ImeText {
  value: string;
  /** Replace the value directly (clamped) — for programmatic edits. */
  set: (next: string) => void;
  /** Clear the field and drop any composition state. */
  reset: () => void;
  /** True when this key event is an IME candidate confirmation, not a submit. */
  isImeKey: (e: React.KeyboardEvent) => boolean;
  /** Spread onto an <input>/<textarea>; supplies value + composition handlers. */
  bind: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    onCompositionStart: () => void;
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  };
}

/**
 * Controlled text state that survives IME composition — Chinese/Japanese input
 * on iOS in particular.
 *
 * Two things break a naive `value` + `onChange(e => setState(slice(...)))` field:
 *
 * 1. Rewriting the controlled value while the IME is mid-composition (which any
 *    truncation or normalisation does) makes iOS Safari drop or duplicate the
 *    candidate being selected. So the raw buffer is stored untouched while
 *    composing and only clamped once composition ends.
 * 2. The Enter that picks a candidate looks exactly like the Enter that submits.
 *    `isComposing`/keyCode 229 catch it on desktop and Android but not reliably
 *    on iOS, so {@link ImeText.isImeKey} also rejects Enter landing inside a
 *    short window after compositionend.
 *
 * Pass `maxLength` to clamp; the HTML `maxlength` attribute is deliberately not
 * used, as it truncates mid-composition and corrupts the buffer the same way.
 */
export function useImeText(maxLength?: number): ImeText {
  const [value, setValue] = useState('');
  const composingRef = useRef(false);
  const endedAtRef = useRef(0);

  const clamp = useCallback(
    (raw: string) => (maxLength != null ? raw.slice(0, maxLength) : raw),
    [maxLength]
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = e.target.value;
      setValue(composingRef.current ? raw : clamp(raw));
    },
    [clamp]
  );

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composingRef.current = false;
      endedAtRef.current = Date.now();
      setValue(clamp((e.target as HTMLInputElement | HTMLTextAreaElement).value));
    },
    [clamp]
  );

  const isImeKey = useCallback((e: React.KeyboardEvent) => {
    const native = e.nativeEvent as KeyboardEvent;
    return (
      composingRef.current ||
      native.isComposing === true ||
      native.keyCode === 229 ||
      Date.now() - endedAtRef.current < IME_ENTER_GRACE_MS
    );
  }, []);

  const set = useCallback((next: string) => setValue(clamp(next)), [clamp]);

  const reset = useCallback(() => {
    composingRef.current = false;
    endedAtRef.current = 0;
    setValue('');
  }, []);

  return {
    value,
    set,
    reset,
    isImeKey,
    bind: { value, onChange, onCompositionStart, onCompositionEnd },
  };
}
