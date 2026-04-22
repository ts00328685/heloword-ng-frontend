import React from 'react';

/**
 * Converts Japanese sentence notation to HTML:
 * - 話[はなし] → <ruby>話<rt>はなし</rt></ruby>
 * - <b>...</b> and other HTML tags are preserved and rendered
 */
function toHtml(text: string): string {
  if (!text) return '';
  return text.replace(/([㐀-鿿豈-﫿]+)\[([^\]]+)\]/g, '<ruby>$1<rt>$2</rt></ruby>');
}

interface SentenceRendererProps {
  text: string;
  className?: string;
}

const SentenceRenderer: React.FC<SentenceRendererProps> = ({ text, className }) => {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: toHtml(text) }}
    />
  );
};

export default SentenceRenderer;
