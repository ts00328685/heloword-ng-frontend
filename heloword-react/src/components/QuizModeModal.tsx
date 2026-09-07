import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { QuizMode, QUIZ_MODE_MIN_WORDS } from '../models';

const LAST_MODE_KEY = 'hw-quiz-mode';

/** Modes offered by the spaced-repetition review flow. */
export const REVIEW_MODES: QuizMode[] = ['spelling', 'matching', 'blast', 'drop'];
/** Modes offered by the free-play challenge flow (no spelling, plus 4-choice). */
export const CHALLENGE_MODES: QuizMode[] = ['choice', 'matching', 'blast', 'drop'];

interface Props {
  /** Words available in the group — decides which board modes are offered. */
  wordCount: number;
  onSelect: (mode: QuizMode) => void;
  onClose: () => void;
  /** Which modes to offer. Defaults to the review set. */
  modes?: QuizMode[];
  /** localStorage key for remembering the last pick, so separate flows don't
   *  hand each other a mode they don't offer. */
  storageKey?: string;
}

const MODES: { mode: QuizMode; icon: React.ReactNode; accent: string }[] = [
  {
    mode: 'choice',
    accent: 'teal',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    ),
  },
  {
    mode: 'spelling',
    accent: 'blue',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    ),
  },
  {
    mode: 'matching',
    accent: 'purple',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m4.5-4.5l1.5-1.5a4 4 0 015.656 5.656l-3 3a4 4 0 01-5.656 0" />
    ),
  },
  {
    mode: 'blast',
    accent: 'orange',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    ),
  },
  {
    mode: 'drop',
    accent: 'rose',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    ),
  },
];

const ACCENT: Record<string, { ring: string; bg: string; text: string; dot: string }> = {
  blue:   { ring: 'border-blue-400 dark:border-blue-500',     bg: 'bg-blue-50 dark:bg-blue-900/20',     text: 'text-blue-500 dark:text-blue-400',     dot: 'bg-blue-500' },
  purple: { ring: 'border-purple-400 dark:border-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-500 dark:text-purple-400', dot: 'bg-purple-500' },
  orange: { ring: 'border-orange-400 dark:border-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-500 dark:text-orange-400', dot: 'bg-orange-500' },
  rose:   { ring: 'border-rose-400 dark:border-rose-500',     bg: 'bg-rose-50 dark:bg-rose-900/20',     text: 'text-rose-500 dark:text-rose-400',     dot: 'bg-rose-500' },
  teal:   { ring: 'border-teal-400 dark:border-teal-500',     bg: 'bg-teal-50 dark:bg-teal-900/20',     text: 'text-teal-500 dark:text-teal-400',     dot: 'bg-teal-500' },
};

const QuizModeModal: React.FC<Props> = ({
  wordCount, onSelect, onClose, modes = REVIEW_MODES, storageKey = LAST_MODE_KEY,
}) => {
  const { t } = useTranslation();

  const isLocked = (mode: QuizMode) => wordCount < QUIZ_MODE_MIN_WORDS[mode];
  const offered = MODES.filter((m) => modes.includes(m.mode));

  const [selected, setSelected] = useState<QuizMode>(() => {
    // A remembered mode from another flow may not be on offer here, so fall
    // back to the first unlocked option rather than starting an unlisted mode.
    const last = localStorage.getItem(storageKey) as QuizMode | null;
    if (last && modes.includes(last) && !isLocked(last)) return last;
    return (offered.find((m) => !isLocked(m.mode)) ?? offered[0]).mode;
  });

  const handleStart = () => {
    if (isLocked(selected)) return;
    localStorage.setItem(storageKey, selected);
    onSelect(selected);
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl animate-sheet-up sm:animate-fade-in mb-16 sm:mb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('quizMode.title')}</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {t('quizMode.subtitle', { count: wordCount })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 -mr-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
              aria-label={t('common.cancel')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-5 pb-4 space-y-2.5 overflow-y-auto">
          {offered.map(({ mode, icon, accent }) => {
            const locked = isLocked(mode);
            const active = selected === mode && !locked;
            const a = ACCENT[accent];
            return (
              <button
                key={mode}
                onClick={() => !locked && setSelected(mode)}
                disabled={locked}
                className={`w-full text-left rounded-2xl border-2 p-3.5 transition-all flex items-start gap-3 ${
                  locked
                    ? 'border-gray-200 dark:border-gray-700 opacity-45 cursor-not-allowed'
                    : active
                      ? `${a.ring} ${a.bg} shadow-sm`
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 active:scale-[0.99]'
                }`}
              >
                <span className={`shrink-0 mt-0.5 ${locked ? 'text-gray-400 dark:text-gray-500' : a.text}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{t(`quizMode.${mode}`)}</span>
                    {active && <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                    {t(`quizMode.${mode}Desc`)}
                  </span>
                  {locked && (
                    <span className="block text-xs text-orange-500 dark:text-orange-400 mt-1.5 font-medium">
                      {t('quizMode.requires', { count: QUIZ_MODE_MIN_WORDS[mode] })}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={handleStart}
            className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-bold py-3 rounded-2xl transition-colors shadow-md"
          >
            {t('quizMode.start')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default QuizModeModal;
