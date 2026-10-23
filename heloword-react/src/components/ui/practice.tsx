import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetSection } from './sheet';
import AudioSettings from '../AudioSettings';
import FuriganaToggle from '../FuriganaToggle';

export { Sheet, SheetSection };

/**
 * Shared layout for practice screens, so every game reads the same way:
 *
 *   PracticeTopBar   — language switch + one "settings" button (filters & prefs live in a Sheet)
 *   …content…
 *   PracticeActions  — quiet tool row + ONE primary action
 *   AiDisclosure     — AI explanation as a single expandable row
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ── Segmented control (underline tabs) ──────────────────────────────────────

export function Segmented<T extends string | number>({ value, options, onChange, size = 'md' }: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex items-center gap-4" role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'shrink-0 whitespace-nowrap border-b-[1.5px] pb-1 transition-colors',
              size === 'sm' ? 'text-xs' : 'text-sm',
              active ? 'border-ink text-ink font-medium' : 'border-transparent text-ink-faint hover:text-ink-muted',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Settings button + bottom sheet ──────────────────────────────────────────

const SlidersIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
  </svg>
);

// ── Switch row ──────────────────────────────────────────────────────────────

export const SwitchRow: React.FC<{ label: string; sub?: string; checked: boolean; onChange: () => void }> = ({ label, sub, checked, onChange }) => (
  <label className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0 cursor-pointer">
    <span className="min-w-0">
      <span className="block text-sm text-ink">{label}</span>
      {sub && <span className="block text-[11px] text-ink-faint mt-0.5">{sub}</span>}
    </span>
    <button
      role="switch"
      aria-checked={checked}
      onClick={(e) => { e.preventDefault(); onChange(); }}
      className={cx('relative shrink-0 w-10 h-[22px] rounded-full transition-colors', checked ? 'bg-ink' : 'bg-ink/15')}
    >
      <span className={cx('absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-surface shadow transition-transform', checked && 'translate-x-[18px]')} />
    </button>
  </label>
);

/** Two-or-more option picker shown as a row inside a Sheet. */
export function OptionRow<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0">
      <span className="text-sm text-ink">{label}</span>
      <div className="inline-flex rounded-md border border-line overflow-hidden">
        {options.map((o) => (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className={cx(
              'px-3 h-8 text-xs transition-colors border-l border-line first:border-l-0',
              o.value === value ? 'bg-ink text-paper' : 'bg-surface text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Top bar ─────────────────────────────────────────────────────────────────

/** Left: optional primary switch (e.g. language). Right: settings button that opens a sheet. */
export const PracticeTopBar: React.FC<{
  left?: React.ReactNode;
  summary?: string;
  settings?: React.ReactNode;
  /** Show the furigana (above / beside) switch — for Japanese content. */
  furigana?: boolean;
}> = ({ left, summary, settings, furigana = false }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 min-h-[36px]">
      <div className="min-w-0">{left}</div>
      {settings && (
        <>
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-line bg-surface text-xs text-ink-muted hover:text-ink hover:border-ink/30 transition-colors max-w-[60%]"
            aria-label={t('common.practiceSettings')}
          >
            <SlidersIcon />
            <span className="truncate">{summary || t('common.practiceSettings')}</span>
          </button>
          <Sheet title={t('common.practiceSettings')} open={open} onClose={() => setOpen(false)}>
            {settings}
            {furigana && (
              <SheetSection title={t('common.display')}>
                <FuriganaToggle variant="row" />
              </SheetSection>
            )}
            <SheetSection title={t('common.audioShort')}>
              <AudioSettings />
            </SheetSection>
          </Sheet>
        </>
      )}
    </div>
  );
};

// ── Actions ─────────────────────────────────────────────────────────────────

export interface ToolAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  analytics?: string;
}

/**
 * Quiet tool row (text buttons separated by hairlines) above one full-width primary button.
 * `primary.emphasis = false` renders it outlined — e.g. "Skip" before the answer is in.
 */
export const PracticeActions: React.FC<{
  tools?: ToolAction[];
  primary?: ToolAction & { emphasis?: boolean };
  secondary?: ToolAction;
  /** Small right-aligned primary button instead of a full-width one — for actions
   *  that are easy to hit by accident (e.g. Skip under a tap-heavy board). */
  compact?: boolean;
}> = ({ tools = [], primary, secondary, compact = false }) => (
  <div className="space-y-3 pt-1">
    {tools.length > 0 && (
      <div className="flex items-stretch justify-center divide-x divide-line">
        {tools.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            disabled={a.disabled}
            data-analytics={a.analytics}
            className={cx(
              'flex-1 px-2 py-1.5 text-sm transition-colors disabled:opacity-30 disabled:pointer-events-none',
              a.active ? 'text-ink font-medium' : 'text-ink-muted hover:text-ink',
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
    )}
    {(primary || secondary) && (
      <div className={cx('flex gap-2', compact && 'justify-end')}>
        {secondary && (
          <button
            onClick={secondary.onClick}
            disabled={secondary.disabled}
            data-analytics={secondary.analytics}
            className="flex-1 h-12 rounded-md border border-line bg-surface text-sm text-ink hover:border-ink/30 transition-colors disabled:opacity-40"
          >
            {secondary.label}
          </button>
        )}
        {primary && (
          <button
            onClick={primary.onClick}
            disabled={primary.disabled}
            data-analytics={primary.analytics}
            className={cx(
              compact ? 'h-9 px-4' : 'flex-[2] h-12',
              'rounded-md text-sm font-medium tracking-wide transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-1.5',
              primary.emphasis === false
                ? 'border border-ink/25 bg-surface text-ink hover:border-ink/50'
                : 'bg-ink text-paper hover:bg-ink/85',
            )}
          >
            {primary.label}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    )}
  </div>
);

// ── AI disclosure ───────────────────────────────────────────────────────────

/** One row that asks the AI and expands its answer underneath. */
export const AiDisclosure: React.FC<{
  label: string;
  open: boolean;
  loading?: boolean;
  loadingText?: string;
  onToggle: () => void;
  analytics?: string;
  children?: React.ReactNode;
}> = ({ label, open, loading, loadingText, onToggle, analytics, children }) => (
  <div className="border-y border-line">
    <button
      onClick={onToggle}
      data-analytics={analytics}
      className="w-full flex items-center justify-between py-3 text-sm text-ink hover:text-accent transition-colors"
      aria-expanded={open}
    >
      <span className="inline-flex items-center gap-2">
        <svg className="w-3 h-3 text-accent" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z" /></svg>
        {label}
      </span>
      <svg className={cx('w-4 h-4 text-ink-faint transition-transform', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    {open && (
      <div className="pb-4 animate-slide-down">
        <div className="border-l-2 border-accent pl-3">
          {loading ? <p className="text-sm text-ink-faint animate-pulse">{loadingText}</p> : children}
        </div>
      </div>
    )}
  </div>
);

/** Small label above a content block ("Your answer", "Word bank"). */
export const BlockLabel: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between mb-2">
    <p className="text-[11px] tracking-wide text-ink-faint">{children}</p>
    {right}
  </div>
);
