import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';

export interface OnboardingStep {
  icon: string;
  iconBg: string;
  title: string;
  body: string;
}

interface OnboardingModalProps {
  steps: OnboardingStep[];
  onDone: () => void;
  onSkip: () => void;
}

const OnboardingModal: React.FC<OnboardingModalProps> = ({ steps, onDone, onSkip }) => {
  const { t } = useTranslation();
  const [current, setCurrent] = React.useState(0);
  const isLast = current === steps.length - 1;
  const step = steps[current];

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-surface rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fade-in mb-16 sm:mb-0 max-h-[calc(90vh-4rem)] sm:max-h-[90vh] flex flex-col">

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Step icon */}
          <div className="px-6 pt-8">
            <span className="font-serif text-4xl text-accent tabular-nums">{String(current + 1).padStart(2, '0')}</span>
          </div>

          {/* Content */}
          <div className="px-6 pt-4 pb-2">
            <h3 className="text-base font-semibold text-ink mb-2 leading-snug">
              {step.title}
            </h3>
            <p className="text-sm text-ink-muted leading-relaxed">
              {step.body}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 pt-4 pb-2">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`rounded-full transition-all ${
                  i === current
                    ? 'w-4 h-2 bg-ink'
                    : 'w-2 h-2 bg-ink/10 hover:bg-ink/20 '
                }`}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Buttons — pinned at bottom, always visible */}
        <div className="flex gap-2 px-6 pt-2 pb-5 shrink-0 border-t border-line">
          {!isLast && (
            <button
              onClick={onSkip}
              className="flex-1 py-2.5 rounded-2xl border border-line text-sm text-ink-faint hover:bg-paper transition-colors"
            >
              {t('tour.skip')}
            </button>
          )}
          {current > 0 && (
            <button
              onClick={() => setCurrent((c) => c - 1)}
              className="py-2.5 px-4 rounded-2xl border border-line text-sm text-ink-muted hover:bg-paper transition-colors"
            >
              ←
            </button>
          )}
          <button
            onClick={() => isLast ? onDone() : setCurrent((c) => c + 1)}
            className="flex-1 py-2.5 rounded-2xl bg-ink hover:bg-ink/85 active:bg-ink/85 text-paper text-sm font-semibold transition-colors"
          >
            {isLast ? t('tour.done') : t('tour.next')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default OnboardingModal;
