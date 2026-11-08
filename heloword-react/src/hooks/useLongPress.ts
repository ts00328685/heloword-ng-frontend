import { useCallback, useEffect, useRef } from 'react';

const MOVE_TOLERANCE = 10; // px a finger may drift before the press counts as a scroll

/**
 * Long press for lists of buttons (one hook, many targets):
 *
 *   const lp = useLongPress();
 *   <button {...lp.bind(() => openSheet(w))} onClick={() => { if (lp.consumed()) return; tap(w); }}>
 *
 * Touch, pen and mouse all work, and a right-click opens it on desktop. The click that
 * follows a long press is swallowed via `consumed()`, so the tile's own tap action
 * (answer, select…) never fires as well.
 */
export function useLongPress(ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const bind = useCallback((onLongPress: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      cancel();
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        navigator.vibrate?.(12);
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_TOLERANCE) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      // Android raises contextmenu on long press, desktop on right-click: both open it.
      e.preventDefault();
      if (fired.current) return;
      cancel();
      fired.current = true;
      onLongPress();
    },
  }), [cancel, ms]);

  /** True once for the click that ends a long press; call it at the top of onClick. */
  const consumed = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  return { bind, consumed };
}

/** Stops iOS from showing its own text-selection / callout on a long press. */
export const NO_CALLOUT = 'select-none [-webkit-touch-callout:none]';
