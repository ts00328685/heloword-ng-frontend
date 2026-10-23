import React from 'react';
import { usePersistedState } from './usePersistedState';

interface Props {
  /** Stable key for remembering open/closed state. */
  id: string;
  title: string;
  /** Small status mark next to the title (e.g. a live dot). */
  indicator?: React.ReactNode;
  /** Shown on the right of the header only while collapsed. */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * Collapsible card. Collapsed content is hidden, not unmounted, so audio,
 * timers and settings inside keep running.
 */
const Panel: React.FC<Props> = ({ id, title, indicator, summary, defaultOpen = true, children }) => {
  const [open, setOpen] = usePersistedState(`panel-${id}-open`, defaultOpen);
  return (
    <section className="bg-surface rounded-2xl border border-line shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-3 w-full px-4 sm:px-5 py-4"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          {title}
          {indicator}
        </span>
        <span className="flex items-center gap-2 text-xs text-ink-faint min-w-0">
          {!open && summary && <span className="font-mono truncate">{summary}</span>}
          <svg className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      <div className={open ? 'px-4 sm:px-5 pb-4 sm:pb-5' : 'hidden'}>{children}</div>
    </section>
  );
};

export const LiveDot: React.FC<{ color: string }> = ({ color }) => (
  <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse ${color}`} />
);

export default Panel;
