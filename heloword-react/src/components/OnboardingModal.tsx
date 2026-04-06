import React from 'react';
import ReactDOM from 'react-dom';

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
  const [current, setCurrent] = React.useState(0);
  const isLast = current === steps.length - 1;
  const step = steps[current];

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fade-in mb-16 sm:mb-0 max-h-[calc(90vh-4rem)] sm:max-h-[90vh] flex flex-col">

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Step icon */}
          <div className={`flex items-center justify-center pt-8 pb-4 ${step.iconBg}`}>
            <span className="text-4xl">{step.icon}</span>
          </div>

          {/* Content */}
          <div className="px-6 pt-4 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
              {current + 1} / {steps.length}
            </p>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2 leading-snug">
              {step.title}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
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
                    ? 'w-4 h-2 bg-blue-500'
                    : 'w-2 h-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Buttons — pinned at bottom, always visible */}
        <div className="flex gap-2 px-6 pt-2 pb-5 shrink-0 border-t border-gray-100 dark:border-gray-800">
          {!isLast && (
            <button
              onClick={onSkip}
              className="flex-1 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Skip
            </button>
          )}
          {current > 0 && (
            <button
              onClick={() => setCurrent((c) => c - 1)}
              className="py-2.5 px-4 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              ←
            </button>
          )}
          <button
            onClick={() => isLast ? onDone() : setCurrent((c) => c + 1)}
            className="flex-1 py-2.5 rounded-2xl bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            {isLast ? 'Got it!' : 'Next →'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default OnboardingModal;
