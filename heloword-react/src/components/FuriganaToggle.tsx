import React from 'react';
import { useTranslation } from 'react-i18next';
import { FuriganaMode, setFuriganaMode, useFuriganaMode } from '../utils/furigana';

const cx = (...c: (string | false)[]) => c.filter(Boolean).join(' ');

/**
 * "Furigana: above | beside" switch. The choice is app-wide and remembered,
 * so flipping it here updates every article, AI explanation and word card.
 * `variant="row"` lays it out as a labelled settings row.
 */
const FuriganaToggle: React.FC<{ variant?: 'inline' | 'row' }> = ({ variant = 'inline' }) => {
  const { t } = useTranslation();
  const mode = useFuriganaMode();
  const options: { value: FuriganaMode; label: React.ReactNode }[] = [
    { value: 'top', label: <ruby className="furigana">字<rt>じ</rt></ruby> },
    { value: 'side', label: <>字<span className="furigana-side">[じ]</span></> },
  ];

  const control = (
    <div className="inline-flex rounded-md border border-line overflow-hidden shrink-0" role="radiogroup" aria-label={t('common.furigana')}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={mode === o.value}
          title={o.value === 'top' ? t('common.furiganaTop') : t('common.furiganaSide')}
          onClick={() => setFuriganaMode(o.value)}
          className={cx(
            'h-8 px-3 text-sm leading-none border-l border-line first:border-l-0 transition-colors inline-flex items-center gap-1.5',
            mode === o.value ? 'bg-ink text-paper [&_rt]:text-paper/70 [&_.furigana-side]:text-paper/70' : 'bg-surface text-ink-muted hover:text-ink',
          )}
        >
          <span className="text-base">{o.label}</span>
          <span className="text-[11px]">{o.value === 'top' ? t('common.furiganaTop') : t('common.furiganaSide')}</span>
        </button>
      ))}
    </div>
  );

  if (variant === 'inline') return control;
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-ink">{t('common.furigana')}</span>
      {control}
    </div>
  );
};

export default FuriganaToggle;
