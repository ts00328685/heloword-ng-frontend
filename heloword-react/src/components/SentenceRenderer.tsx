import React from 'react';
import { FuriganaMode, READING_RE, useFuriganaMode } from '../utils/furigana';

/**
 * Converts Japanese sentence notation to HTML:
 * - 話[はなし] → furigana above (<ruby>) or beside the kanji, per the user's setting
 * - <b>...</b> and other HTML tags are preserved and rendered
 */
function toHtml(text: string, mode: FuriganaMode): string {
  if (!text) return '';
  READING_RE.lastIndex = 0;
  return text.replace(
    READING_RE,
    mode === 'top' ? '<ruby class="furigana">$1<rt>$2</rt></ruby>' : '$1<span class="furigana-side">[$2]</span>',
  );
}

interface SentenceRendererProps {
  text: string;
  className?: string;
}

const SentenceRenderer: React.FC<SentenceRendererProps> = ({ text, className }) => {
  const mode = useFuriganaMode();
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: toHtml(text, mode) }}
    />
  );
};

export default SentenceRenderer;
