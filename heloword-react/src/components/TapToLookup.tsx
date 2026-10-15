import React, { useCallback, useEffect, useRef, useState } from 'react';
import { findTappedWordInMixedText, LookupLang, TappedWord, textOffsetFromPoint } from '../utils/wordLookup';
import WordLookupSheet from './WordLookupSheet';

const HIGHLIGHT = 'word-lookup';

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
const registry = (): HighlightRegistry | null =>
  (globalThis as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights ?? null;
const HighlightCtor = (): (new (r: Range) => unknown) | null =>
  (globalThis as unknown as { Highlight?: new (r: Range) => unknown }).Highlight ?? null;

/**
 * Highlights [start, end) of the container's text via the CSS Custom Highlight API, which
 * colours text without touching the DOM — so it works over any children (markdown, spans).
 * Browsers without the API just skip the highlight.
 */
function highlight(container: HTMLElement, start: number, end: number): void {
  const reg = registry();
  const Ctor = HighlightCtor();
  if (!reg || !Ctor) return;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let base = 0;
  let started = false;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!started && start < base + n.length) { range.setStart(n, start - base); started = true; }
    if (started && end <= base + n.length) { range.setEnd(n, end - base); reg.set(HIGHLIGHT, new Ctor(range)); return; }
    base += n.length;
  }
}

const clearHighlight = () => registry()?.delete(HIGHLIGHT);

/**
 * Makes the Japanese/English words inside AI-generated text tappable for lookup. Wrap any
 * rendered AI text; the Chinese explanation around those words stays inert.
 */
const TapToLookup: React.FC<{ children: React.ReactNode; as?: 'span' | 'div'; className?: string }> = ({
  children,
  as: Tag = 'span',
  className,
}) => {
  const ref = useRef<HTMLElement>(null);
  const [tap, setTap] = useState<(TappedWord & { lang: LookupLang }) | null>(null);

  const onClick = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const offset = textOffsetFromPoint(el, e.clientX, e.clientY);
    if (offset === null) return;
    const word = findTappedWordInMixedText(el.textContent ?? '', offset);
    if (!word) return;
    // Panels often sit inside clickable cards; a word tap must not also toggle the card.
    e.stopPropagation();
    highlight(el, word.start, word.end);
    setTap(word);
  };

  const close = useCallback(() => { clearHighlight(); setTap(null); }, []);
  // Clear only on unmount: a cleanup keyed on `tap` would run on the *next* tap and wipe
  // the highlight that was just drawn for it.
  const openRef = useRef(false);
  openRef.current = tap !== null;
  useEffect(() => () => { if (openRef.current) clearHighlight(); }, []);

  return (
    <>
      {React.createElement(Tag, { ref, onClick, className, 'data-no-analytics': true }, children)}
      {tap && <WordLookupSheet tapped={tap} lang={tap.lang} context="ai_text" onClose={close} />}
    </>
  );
};

export default TapToLookup;
