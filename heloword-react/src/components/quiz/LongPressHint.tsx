import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * "Long-press a word for its tools" tip under quiz boards. An accent pill with a
 * looping fingertip press-and-ripple so the gesture is noticed, not just read.
 */
const LongPressHint: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t } = useTranslation();
  return (
    <div className={`flex justify-center animate-fade-in-up ${className}`}>
      <p className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-accent-soft text-accent text-xs font-medium leading-snug">
        <span className="long-press-hint-icon relative flex-shrink-0 w-4 h-4" aria-hidden="true">
          <span className="long-press-hint-ring absolute inset-0 rounded-full border-2 border-accent" />
          <span className="long-press-hint-dot absolute inset-1 rounded-full bg-accent" />
        </span>
        <span>{t('wordSheet.longPressHint')}</span>
      </p>
    </div>
  );
};

export default LongPressHint;
