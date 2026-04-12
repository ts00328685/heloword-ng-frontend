import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface MCWord {
  id: number;
  word: string;
  translateEn: string;
  translateCh?: string | null;
  sentence?: string | null;
}

interface Props {
  words: MCWord[];
  onExit: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateOptions(correct: MCWord, pool: MCWord[]): MCWord[] {
  const others = shuffle(pool.filter((w) => w.id !== correct.id));
  return shuffle([correct, ...others.slice(0, 3)]);
}

const MultiChoicePanel: React.FC<Props> = ({ words, onExit }) => {
  const { t } = useTranslation();

  // Show the too-few popup immediately if not enough words
  const tooFew = words.length < 4;

  const initState = () => {
    const order = shuffle(words);
    return { order, options: generateOptions(order[0], words) };
  };

  const [{ order: initOrder, options: initOptions }] = useState(() => tooFew ? { order: [], options: [] } : initState());
  const [mcWords, setMcWords] = useState<MCWord[]>(initOrder);
  const [mcOptions, setMcOptions] = useState<MCWord[]>(initOptions);
  const [mcIndex, setMcIndex] = useState(0);
  const [mcSelected, setMcSelected] = useState<number | null>(null);
  const [mcScore, setMcScore] = useState(0);
  const [mcDone, setMcDone] = useState(false);

  // Re-init is called on retry
  const restart = () => {
    const order = shuffle(words);
    setMcWords(order);
    setMcIndex(0);
    setMcScore(0);
    setMcSelected(null);
    setMcDone(false);
    setMcOptions(generateOptions(order[0], words));
  };

  const handleSelect = (word: MCWord) => {
    if (mcSelected !== null) return;
    const correct = mcWords[mcIndex];
    if (word.id === correct.id) setMcScore((s) => s + 1);
    setMcSelected(word.id);
    setTimeout(() => {
      const next = mcIndex + 1;
      if (next >= mcWords.length) {
        setMcDone(true);
      } else {
        setMcIndex(next);
        setMcSelected(null);
        setMcOptions(generateOptions(mcWords[next], words));
      }
    }, 1000);
  };

  // ── Too-few popup ─────────────────────────────────────────────────────────────
  if (tooFew) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onExit}>
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-7 mx-6 max-w-xs w-full flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-gray-900 dark:text-white">{t('review.multiChoiceTooFewTitle')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('review.multiChoiceTooFewBody')}</p>
          </div>
          <button
            onClick={onExit}
            className="w-full py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {t('review.multiChoiceConfirm')}
          </button>
        </div>
      </div>
    );
  }

  // ── Results screen ────────────────────────────────────────────────────────────
  if (mcDone) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-28 select-none">
        <div className="w-full max-w-sm flex flex-col items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{mcScore} / {mcWords.length}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              {mcScore === mcWords.length
                ? t('review.multiChoiceAllCorrect')
                : mcScore >= mcWords.length * 0.7
                  ? t('review.multiChoiceGood')
                  : t('review.multiChoiceKeepGoing')}
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={restart}
              className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors"
            >
              {t('review.multiChoiceRetry')}
            </button>
            <button
              onClick={onExit}
              className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t('review.multiChoiceExit')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Question screen ───────────────────────────────────────────────────────────
  const current = mcWords[mcIndex];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-28 select-none">
      <div className="w-full max-w-sm flex flex-col gap-5">
        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${(mcIndex / mcWords.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{mcIndex + 1} / {mcWords.length}</span>
        </div>

        {/* Question card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-lg px-8 py-8 flex flex-col items-center gap-3">
          <p className="text-[11px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500">
            {t('review.multiChoicePrompt')}
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white text-center leading-snug">
            {current.translateEn}
          </p>
          {current.translateCh && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">{current.translateCh}</p>
          )}
          {current.sentence && (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic text-center line-clamp-2 mt-1">
              {current.sentence}
            </p>
          )}
        </div>

        {/* Option buttons */}
        <div className="grid grid-cols-1 gap-3">
          {mcOptions.map((opt) => {
            const isCorrect = opt.id === current.id;
            const isChosen = mcSelected === opt.id;
            const revealed = mcSelected !== null;

            let cls = 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20';
            if (revealed) {
              if (isCorrect) cls = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
              else if (isChosen) cls = 'border-red-400 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400';
              else cls = 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-600 opacity-50';
            }

            return (
              <button
                key={opt.id}
                onClick={() => handleSelect(opt)}
                disabled={revealed}
                className={`py-4 px-3 rounded-2xl border-2 text-sm font-semibold text-center transition-all duration-200 ${cls}`}
              >
                {opt.word}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MultiChoicePanel;
