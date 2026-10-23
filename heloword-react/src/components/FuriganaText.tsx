import React from 'react';
import { findReadings, FuriganaMode, useFuriganaMode } from '../utils/furigana';

/**
 * Renders 漢字[かな] as furigana — above the kanji (ruby) or beside it, per the
 * user's setting. Builds React elements only, never innerHTML, so it is safe
 * for AI output and user-saved text.
 *
 * The DOM keeps every source character (the brackets are hidden, not removed),
 * so text offsets — tap-to-look-up, read-aloud highlighting — still line up
 * with the original string.
 */
const FuriganaText: React.FC<{ text: string; className?: string; mode?: FuriganaMode }> = ({ text, className, mode }) => {
  const preferred = useFuriganaMode();
  const nodes = renderFurigana(text, mode ?? preferred);
  return className ? <span className={className}>{nodes}</span> : <>{nodes}</>;
};

export function renderFurigana(text: string, mode: FuriganaMode): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const r of findReadings(text)) {
    if (r.start > last) parts.push(text.slice(last, r.start));
    parts.push(
      mode === 'top' ? (
        <ruby key={r.start} className="furigana">
          {r.base}
          <rt><span className="hidden">[</span>{r.reading}<span className="hidden">]</span></rt>
        </ruby>
      ) : (
        <React.Fragment key={r.start}>
          {r.base}
          <span className="furigana-side">[{r.reading}]</span>
        </React.Fragment>
      ),
    );
    last = r.end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Maps string children through FuriganaText (for markdown renderers). */
export function withFurigana(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) =>
    typeof child === 'string' ? <FuriganaText text={child} /> : child,
  );
}

export default FuriganaText;
