import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sentence } from '../../models';
import { meaningText, pickDecoys, promptText, shuffle, wordKey } from './boardUtils';

interface Props {
  /** The words of this set — every one must be cleared before the set completes. */
  words: Sentence[];
  /** Full quiz list, used only to borrow decoy tiles when the set is small. */
  pool: Sentence[];
  /** Fired once every word is cleared. `failed` maps wordKey → number of wrong taps. */
  onComplete: (failed: Map<string, number>) => void;
  setIndex: number;
  setTotal: number;
  onPronounce?: (word: Sentence) => void;
}

interface Tile {
  key: string;
  word: Sentence;
  /** Decoys are never prompted — they only exist to be wrong answers. */
  decoy: boolean;
}

const BlastBoard: React.FC<Props> = ({ words, pool, onComplete, setIndex, setTotal, onPronounce }) => {
  const { t, i18n } = useTranslation();

  const failedRef = useRef<Map<string, number>>(new Map());
  const completedRef = useRef(false);

  const setId = useMemo(() => words.map(wordKey).join('|'), [words]);

  const tiles = useMemo<Tile[]>(() => {
    const real = words.map((w) => ({ key: wordKey(w), word: w, decoy: false }));
    // Keep at least six tiles on the board so the last few words aren't a free tap.
    const decoys = pickDecoys(pool, words, Math.max(0, 6 - words.length)).map((w, i) => ({
      key: `decoy-${i}-${wordKey(w)}`,
      word: w,
      decoy: true,
    }));
    return shuffle([...real, ...decoys]);
  }, [setId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [queue, setQueue] = useState<string[]>([]);
  const [cleared, setCleared] = useState<string[]>([]);
  const [bursting, setBursting] = useState<string | null>(null);
  const [shaking, setShaking] = useState<string | null>(null);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [done, setDone] = useState(false);

  // Fresh board whenever the set changes.
  useEffect(() => {
    failedRef.current = new Map();
    completedRef.current = false;
    setQueue(shuffle(words.map(wordKey)));
    setCleared([]);
    setBursting(null);
    setShaking(null);
    setCombo(0);
    setBestCombo(0);
    setDone(false);
  }, [setId]); // eslint-disable-line react-hooks/exhaustive-deps

  const promptKey = queue[0];
  const promptWord = useMemo(
    () => words.find((w) => wordKey(w) === promptKey),
    [promptKey, words],
  );

  const clearedSet = useMemo(() => new Set(cleared), [cleared]);

  const handleTap = (tile: Tile) => {
    if (done || !promptKey || bursting || clearedSet.has(tile.key)) return;

    if (tile.key === promptKey) {
      setBursting(tile.key);
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setBestCombo((b) => Math.max(b, nextCombo));
      onPronounce?.(tile.word);
      // Taps are disabled while a tile is bursting, so the queue captured here
      // is still current when the timer fires.
      const rest = queue.slice(1);
      setTimeout(() => {
        setBursting(null);
        setCleared((prev) => [...prev, tile.key]);
        setQueue(rest);
        if (rest.length === 0 && !completedRef.current) {
          setDone(true);
          setTimeout(() => {
            if (completedRef.current) return;
            completedRef.current = true;
            onComplete(new Map(failedRef.current));
          }, 650);
        }
      }, 340);
      return;
    }

    // Wrong tile — the prompted word is what wasn't recognised, so it takes the
    // penalty. The prompt stays put until it is found.
    failedRef.current.set(promptKey, (failedRef.current.get(promptKey) ?? 0) + 1);
    setCombo(0);
    setShaking(tile.key);
    setTimeout(() => setShaking(null), 380);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {t('quizMode.setProgress', { current: setIndex, total: setTotal })}
        </p>
        {combo >= 2 ? (
          <span key={combo} className="animate-quiz-combo text-xs font-bold text-orange-500 dark:text-orange-400">
            {t('quizMode.combo', { count: combo })} 🔥
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {t('quizMode.remaining', { count: queue.length })}
          </span>
        )}
      </div>

      {/* Prompt */}
      <div className="relative rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/10 border border-orange-200 dark:border-orange-800/60 px-4 py-5 mb-4 text-center min-h-[5.5rem] flex flex-col items-center justify-center">
        {done ? (
          <div className="animate-quiz-clear bg-green-500 text-white text-sm font-bold px-5 py-2.5 rounded-2xl shadow-lg">
            {t('quizMode.setClear')}
            {bestCombo >= 2 && <span className="ml-2 font-normal">{t('quizMode.bestCombo', { count: bestCombo })}</span>}
          </div>
        ) : promptWord ? (
          <>
            <p className="text-[11px] uppercase tracking-wider text-orange-500/70 dark:text-orange-400/70 font-semibold mb-1.5">
              {t('quizMode.blastHint')}
            </p>
            <p className="text-base font-bold text-gray-800 dark:text-gray-100 leading-snug break-words">
              {meaningText(promptWord, i18n.language)}
            </p>
          </>
        ) : null}
      </div>

      {/* Tile grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {tiles.map((tile) => {
          const isCleared = clearedSet.has(tile.key);
          const isBursting = bursting === tile.key;
          const isShaking = shaking === tile.key;
          if (isCleared) {
            // Keep the slot so the grid never reflows mid-set.
            return <div key={tile.key} className="min-h-[3.5rem] rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700" aria-hidden="true" />;
          }
          return (
            <button
              key={tile.key}
              onClick={() => handleTap(tile)}
              disabled={done || !!bursting}
              className={`min-h-[3.5rem] px-2.5 py-2 rounded-xl border-2 text-sm font-semibold break-words transition-colors ${
                isBursting
                  ? 'animate-quiz-burst border-green-400 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300'
                  : isShaking
                    ? 'animate-quiz-shake border-red-400 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:border-orange-400 active:scale-95'
              }`}
            >
              {promptText(tile.word)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BlastBoard;
