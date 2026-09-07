import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sentence } from '../../models';
import { meaningText, pickDecoys, promptText, randomLineColor, shuffle, wordKey } from './boardUtils';

interface Props {
  /** The words of this set — every one must be connected before the set completes. */
  words: Sentence[];
  /** Full quiz list, used only to borrow decoy meanings when the set is small. */
  pool: Sentence[];
  /** Fired once every word is connected. `failed` maps wordKey → number of wrong picks. */
  onComplete: (failed: Map<string, number>) => void;
  /** 1-based index of this set and the total number of sets, for the header. */
  setIndex: number;
  /** Total rounds. Omitted in free-play, where rounds are endless. */
  setTotal?: number;
  onPronounce?: (word: Sentence) => void;
}

interface RightItem {
  key: string;
  text: string;
  /** Decoys are never connectable — they exist to keep small sets hard. */
  decoy: boolean;
}

interface Connection {
  key: string;
  color: string;
}

interface LineCoord extends Connection {
  x1: number; y1: number; x2: number; y2: number;
}

const MatchingBoard: React.FC<Props> = ({ words, pool, onComplete, setIndex, setTotal, onPronounce }) => {
  const { t, i18n } = useTranslation();

  const containerRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rightRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Wrong counts survive board resets — they decide which words get requeued.
  const failedRef = useRef<Map<string, number>>(new Map());
  const completedRef = useRef(false);

  // Set identity: the board rebuilds only when the set of words actually changes.
  const setId = useMemo(() => words.map(wordKey).join('|'), [words]);

  const left = useMemo(() => shuffle(words), [setId]); // eslint-disable-line react-hooks/exhaustive-deps

  const right = useMemo<RightItem[]>(() => {
    const real = words.map((w) => ({ key: wordKey(w), text: meaningText(w, i18n.language), decoy: false }));
    // A 2-word board is a giveaway; pad the answer column so there is always a real choice.
    const decoys = pickDecoys(pool, words, Math.max(0, 4 - words.length)).map((w, i) => ({
      key: `decoy-${i}-${wordKey(w)}`,
      text: meaningText(w, i18n.language),
      decoy: true,
    }));
    return shuffle([...real, ...decoys]);
  }, [setId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [wrongKeys, setWrongKeys] = useState<{ left: string; right: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [lines, setLines] = useState<LineCoord[]>([]);

  // Fresh board whenever the set changes.
  useEffect(() => {
    failedRef.current = new Map();
    completedRef.current = false;
    setConnections([]);
    setSelectedLeft(null);
    setWrongKeys(null);
    setResetting(false);
    setCleared(false);
    setLines([]);
  }, [setId]);

  const connectedKeys = useMemo(() => new Set(connections.map((c) => c.key)), [connections]);

  // ── Connector geometry ────────────────────────────────────────────────────
  // Endpoints are measured from the live DOM so lines survive wrapping, font
  // scaling and orientation changes; recomputed on resize as well as on connect.
  const measure = useCallback(() => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const next: LineCoord[] = [];
    connections.forEach((c) => {
      const l = leftRefs.current[c.key];
      const r = rightRefs.current[c.key];
      if (!l || !r) return;
      const lb = l.getBoundingClientRect();
      const rb = r.getBoundingClientRect();
      next.push({
        ...c,
        x1: lb.right - box.left,
        y1: lb.top + lb.height / 2 - box.top,
        x2: rb.left - box.left,
        y2: rb.top + rb.height / 2 - box.top,
      });
    });
    setLines(next);
  }, [connections]);

  useLayoutEffect(() => { measure(); }, [measure]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [measure]);

  // ── Interaction ───────────────────────────────────────────────────────────

  const handleLeftClick = (w: Sentence) => {
    const key = wordKey(w);
    if (resetting || cleared || connectedKeys.has(key)) return;
    setSelectedLeft((prev) => (prev === key ? null : key));
    onPronounce?.(w);
  };

  const handleRightClick = (item: RightItem) => {
    if (resetting || cleared || !selectedLeft || connectedKeys.has(item.key)) return;

    if (!item.decoy && item.key === selectedLeft) {
      const next = [...connections, { key: item.key, color: randomLineColor(connections.map((c) => c.color)) }];
      setConnections(next);
      setSelectedLeft(null);
      if (next.length === words.length) {
        setCleared(true);
        // Let the last connector finish drawing before the set is handed back.
        setTimeout(() => {
          if (completedRef.current) return;
          completedRef.current = true;
          onComplete(new Map(failedRef.current));
        }, 700);
      }
      return;
    }

    // Wrong pick — the selected word is what the learner got wrong, so only it is
    // penalised. Every existing connection is wiped and the set restarts.
    const k = selectedLeft;
    failedRef.current.set(k, (failedRef.current.get(k) ?? 0) + 1);
    setWrongKeys({ left: k, right: item.key });
    setResetting(true);
    setTimeout(() => {
      setConnections([]);
      setSelectedLeft(null);
      setWrongKeys(null);
      setResetting(false);
    }, 600);
  };

  const remaining = words.length - connections.length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {setTotal ? t('quizMode.setProgress', { current: setIndex, total: setTotal }) : t('quizMode.roundNo', { n: setIndex })}
        </p>
        <p className={`text-xs font-semibold ${resetting ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
          {resetting ? t('quizMode.wrongReset') : t('quizMode.remaining', { count: remaining })}
        </p>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{t('quizMode.matchHint')}</p>

      <div ref={containerRef} className="relative">
        {/* Connector overlay — pointer-events off so it never eats a tap */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" aria-hidden="true">
          {lines.map((l) => (
            <line
              key={l.key}
              className="quiz-line"
              x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke={l.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              pathLength={1}
            />
          ))}
        </svg>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {/* Word column */}
          <div className="flex flex-col gap-2 items-start">
            {left.map((w) => {
              const key = wordKey(w);
              const done = connectedKeys.has(key);
              const isSelected = selectedLeft === key;
              const isWrong = wrongKeys?.left === key;
              return (
                <button
                  key={key}
                  ref={(el) => { leftRefs.current[key] = el; }}
                  onClick={() => handleLeftClick(w)}
                  disabled={done || resetting || cleared}
                  className={`w-[70%] h-16 px-3 py-2 rounded-xl border-2 text-sm font-semibold text-left break-words flex items-center transition-colors ${
                    isWrong
                      ? 'animate-quiz-shake border-red-400 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300'
                      : done
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-gray-400 dark:text-gray-500'
                        : isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 shadow-sm'
                          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:border-blue-300 active:scale-[0.98]'
                  }`}
                >
                  <span className="line-clamp-2">{promptText(w)}</span>
                </button>
              );
            })}
          </div>

          {/* Meaning column */}
          <div className="flex flex-col gap-2 items-end">
            {right.map((item) => {
              const done = connectedKeys.has(item.key);
              const isWrong = wrongKeys?.right === item.key;
              return (
                <button
                  key={item.key}
                  ref={(el) => { rightRefs.current[item.key] = el; }}
                  onClick={() => handleRightClick(item)}
                  disabled={done || resetting || cleared || !selectedLeft}
                  className={`w-[70%] h-16 px-3 py-2 rounded-xl border-2 text-[11px] font-medium text-left break-words leading-snug flex items-center transition-colors ${
                    isWrong
                      ? 'animate-quiz-shake border-red-400 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300'
                      : done
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-gray-400 dark:text-gray-500'
                        : selectedLeft
                          ? 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-purple-400 active:scale-[0.98]'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <span className="line-clamp-3">{item.text}</span>
                </button>
              );
            })}
          </div>
        </div>

        {cleared && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="animate-quiz-clear bg-green-500 text-white text-sm font-bold px-5 py-2.5 rounded-2xl shadow-lg">
              {t('quizMode.setClear')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchingBoard;
