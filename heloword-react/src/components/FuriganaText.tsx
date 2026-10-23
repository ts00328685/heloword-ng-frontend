import React from 'react';

const READING = /([㐀-鿿豈-﫿々〆ヶ]+)\[([^\]]+)\]/g;

/**
 * Renders 漢字[かな] as <ruby>. Builds React elements only — never innerHTML — so it is
 * safe for AI output and user-saved text.
 */
const FuriganaText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  READING.lastIndex = 0;
  for (let m = READING.exec(text); m; m = READING.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <ruby key={m.index}>
        {m[1]}
        <rt className="text-[0.6em] text-ink-faint">{m[2]}</rt>
      </ruby>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts}</span>;
};

export default FuriganaText;
