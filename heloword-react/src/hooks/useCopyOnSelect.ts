import { useEffect } from 'react';

/** localStorage key for the "Copy on highlight" setting. Missing = enabled. */
export const COPY_ON_SELECT_KEY = 'hw-copy-on-select';

export const isCopyOnSelectEnabled = (): boolean => {
  try { return localStorage.getItem(COPY_ON_SELECT_KEY) !== 'false'; } catch { return true; }
};

/** Longer selections are almost always accidental (select-all, dragging over a page). */
const MAX_LENGTH = 300;
/** Wait for touch selection handles to settle before acting. */
const SETTLE_MS = 450;

/** Selections inside fields belong to the user's typing, not to the page text. */
const isEditable = (node: Node | null): boolean => {
  const el = node instanceof Element ? node : node?.parentElement;
  if (!el) return false;
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
};

/**
 * Once the user finishes highlighting text, copy it to the clipboard and announce it
 * on `hw-chatbot-word-copied` so the assistant can pick it up — no manual copy needed.
 * Toggled in the menu (Assistant → Copy on highlight); on by default.
 */
export function useCopyOnSelect() {
  useEffect(() => {
    let pointerDown = false;
    let timer: number | undefined;
    // The text last handled, so a selection that lingers (or re-fires selectionchange)
    // is not copied again until the user selects something else.
    let lastHandled = '';

    const handle = () => {
      if (pointerDown || !isCopyOnSelectEnabled()) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { lastHandled = ''; return; }
      if (isEditable(sel.anchorNode) || isEditable(sel.focusNode)) return;
      // Inputs keep their selection internally; activeElement catches those too.
      if (isEditable(document.activeElement) && document.activeElement !== document.body) return;
      const text = sel.toString().trim();
      if (!text || text.length > MAX_LENGTH || text === lastHandled) return;
      lastHandled = text;

      navigator.clipboard?.writeText(text).catch(() => { /* blocked or insecure context — the assistant still gets the text */ });
      window.dispatchEvent(new CustomEvent('hw-chatbot-word-copied', { detail: { text } }));
    };

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(handle, delay);
    };

    const onPointerDown = () => { pointerDown = true; window.clearTimeout(timer); };
    const onPointerUp = () => { pointerDown = false; schedule(SETTLE_MS); };
    // Keyboard selection (shift+arrows) and touch-handle drags only surface here.
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { lastHandled = ''; window.clearTimeout(timer); return; }
      if (!pointerDown) schedule(SETTLE_MS * 2);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, []);
}
