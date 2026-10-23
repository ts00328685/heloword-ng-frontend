import React from 'react';

/**
 * 和 UI primitives. New screens should build from these + the semantic tokens
 * (paper / surface / ink / line / accent) instead of raw Tailwind colours.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink/85',
  secondary: 'border border-line bg-surface text-ink hover:border-ink/40',
  ghost: 'text-ink-muted hover:text-ink',
  danger: 'border border-line bg-surface text-beni-600 dark:text-beni-300 hover:border-beni-400',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', className, ...rest }) => (
  <button
    className={cx(
      'inline-flex items-center justify-center gap-1.5 rounded-md font-medium tracking-wide transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none',
      VARIANTS[variant],
      SIZES[size],
      className,
    )}
    {...rest}
  />
);

// ── Section header ──────────────────────────────────────────────────────────

/** Serif title, optional small eyebrow label, optional quiet text action on the right. */
export const SectionHeader: React.FC<{
  title: React.ReactNode;
  eyebrow?: string;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
  action?: { label: string; onClick: () => void; analytics?: string };
}> = ({ title, eyebrow, subtitle, extra, action }) => (
  <div className="flex items-end justify-between gap-3 mb-3">
    <div className="min-w-0">
      {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
      <div className="flex items-center gap-1.5">
        <h2 className="font-serif text-[17px] leading-tight text-ink">{title}</h2>
        {extra}
      </div>
      {subtitle && <p className="mt-1 text-xs text-ink-muted">{subtitle}</p>}
    </div>
    {action && (
      <TextAction onClick={action.onClick} data-analytics={action.analytics}>
        {action.label}
      </TextAction>
    )}
  </div>
);

export const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cx('text-[10px] font-medium uppercase tracking-label text-ink-faint', className)}>{children}</p>
);

/** "View all →" style link-button. */
export const TextAction: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, children, ...rest }) => (
  <button
    className={cx('shrink-0 inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors', className)}
    {...rest}
  >
    {/* Some i18n labels already end in an arrow; the chevron replaces it */}
    {typeof children === 'string' ? children.replace(/\s*[→›>]+\s*$/, '') : children}
    <ChevronRight className="w-3 h-3" />
  </button>
);

// ── Grid panel (畳 tatami grid: hairline-separated cells, no floating cards) ──

export const GridPanel: React.FC<{ children: React.ReactNode; cols?: 1 | 2; className?: string }> = ({ children, cols = 2, className }) => {
  // Pad an odd last row so the hairline background never shows as a grey block.
  const filler = cols === 2 && React.Children.toArray(children).length % 2 === 1;
  return (
  <div
    className={cx(
      'grid gap-px overflow-hidden rounded-md border border-line bg-line',
      cols === 2 ? 'grid-cols-2' : 'grid-cols-1',
      className,
    )}
  >
    {children}
    {filler && <div className="bg-surface" aria-hidden="true" />}
  </div>
  );
};

/** One cell of a GridPanel. Renders a <button> when onClick is given. */
export const GridCell: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  analytics?: string;
}> = ({ children, onClick, className, analytics }) => {
  const base = cx('relative bg-surface p-3.5 text-left', className);
  return onClick ? (
    <button onClick={onClick} data-analytics={analytics} className={cx(base, 'transition-colors hover:bg-paper')}>
      {children}
    </button>
  ) : (
    <div className={base}>{children}</div>
  );
};

// ── Small bits ──────────────────────────────────────────────────────────────

/** Plain-text meta label (language code, count…). No chip background. */
export const Meta: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span className={cx('text-[10px] font-medium uppercase tracking-wider text-ink-faint', className)}>{children}</span>
);

export const HelpDot: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label }) => (
  <button
    onClick={onClick}
    aria-label={label}
    className="w-4 h-4 rounded-full border border-line text-ink-faint text-[9px] flex items-center justify-center hover:text-ink hover:border-ink/40 transition-colors"
  >
    ?
  </button>
);

export const ChevronRight: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
  </svg>
);
