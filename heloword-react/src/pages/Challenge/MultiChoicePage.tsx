import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Word, Sentence } from '../../models';
import AddToGroupModal from '../../components/AddToGroupModal';

// ── Types ──────────────────────────────────────────────────────────────────

type GameType = 'en' | 'jp';

interface LevelDef {
  key: string;
  labelKey: string;
  descKey: string;
  min: number; // 0-based inclusive
  max: number; // 0-based exclusive, -1 = use full list
}

type AnswerState = 'idle' | 'correct' | 'wrong';

// ── Level configs ──────────────────────────────────────────────────────────

const EN_LEVELS: LevelDef[] = [
  { key: 'easy',         labelKey: 'multiChoice.easy',         descKey: 'multiChoice.enEasyDesc',         min: 0,    max: 2000  },
  { key: 'medium',       labelKey: 'multiChoice.medium',       descKey: 'multiChoice.enMediumDesc',       min: 2000, max: 4000  },
  { key: 'intermediary', labelKey: 'multiChoice.intermediary', descKey: 'multiChoice.enIntermediaryDesc', min: 4000, max: 6421  },
  { key: 'advanced',     labelKey: 'multiChoice.advanced',     descKey: 'multiChoice.enAdvancedDesc',     min: 6421, max: 9481  },
];

const JP_LEVELS: LevelDef[] = [
  { key: 'easy',         labelKey: 'multiChoice.easy',         descKey: 'multiChoice.jpEasyDesc',         min: 0,    max: 2000  },
  { key: 'medium',       labelKey: 'multiChoice.medium',       descKey: 'multiChoice.jpMediumDesc',       min: 2000, max: 4000  },
  { key: 'intermediary', labelKey: 'multiChoice.intermediary', descKey: 'multiChoice.jpIntermediaryDesc', min: 4000, max: 7000  },
  { key: 'advanced',     labelKey: 'multiChoice.advanced',     descKey: 'multiChoice.jpAdvancedDesc',     min: 7000, max: 9117  },
  { key: 'verbs',        labelKey: 'multiChoice.verbs',        descKey: 'multiChoice.jpVerbsDesc',        min: 0,    max: -1    },
];

const LEVEL_COLORS: Record<string, string> = {
  easy:         'bg-green-500 hover:bg-green-600',
  medium:       'bg-blue-500 hover:bg-blue-600',
  intermediary: 'bg-orange-500 hover:bg-orange-600',
  advanced:     'bg-red-500 hover:bg-red-600',
  verbs:        'bg-purple-500 hover:bg-purple-600',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[], count: number, exclude?: T): T[] {
  const pool = exclude !== undefined ? arr.filter(x => x !== exclude) : [...arr];
  const result: T[] = [];
  const used = new Set<number>();
  while (result.length < count && used.size < pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    if (!used.has(idx)) {
      used.add(idx);
      result.push(pool[idx]);
    }
  }
  return result;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Level picker modal ─────────────────────────────────────────────────────

const LevelPickerModal: React.FC<{
  gameType: GameType;
  onSelect: (level: LevelDef) => void;
  onBack: () => void;
}> = ({ gameType, onSelect, onBack }) => {
  const { t } = useTranslation();
  const levels = gameType === 'en' ? EN_LEVELS : JP_LEVELS;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onBack}>
      <div
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-sm shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">
            {t('multiChoice.selectLevel')}
          </h3>
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>
        <div className="space-y-2">
          {levels.map(level => (
            <button
              key={level.key}
              onClick={() => onSelect(level)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-white font-medium text-sm transition-colors ${LEVEL_COLORS[level.key]}`}
            >
              <span>{t(level.labelKey)}</span>
              <span className="text-xs opacity-80">{t(level.descKey)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────

const MultiChoicePage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { wordStore, isFullyLoaded, loadFullDashboard } = useData();
  const { isLoggedIn } = useAuth();
  const [heartWord, setHeartWord] = useState<Sentence | null>(null);

  const gameType: GameType = (location.state as { gameType?: GameType } | null)?.gameType ?? 'en';

  const [selectedLevel, setSelectedLevel] = useState<LevelDef | null>(null);
  const [pool, setPool] = useState<Word[]>([]);
  const [correct, setCorrect] = useState<Word | null>(null);
  const [choices, setChoices] = useState<Word[]>([]);
  const [answerState, setAnswerState] = useState<AnswerState>('idle');
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [total, setTotal] = useState(0);
  const [showLevelPicker, setShowLevelPicker] = useState(true);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Build pool from wordStore ────────────────────────────────────────────

  const buildPool = useCallback((level: LevelDef): Word[] => {
    let list: Word[];
    if (gameType === 'en') {
      list = wordStore.wordEnglishList as Word[];
    } else if (level.key === 'verbs') {
      list = wordStore.wordJapaneseVerbList as Word[];
    } else {
      list = wordStore.wordJapaneseList as Word[];
    }
    if (level.max === -1) return list;
    return list.slice(level.min, Math.min(level.max, list.length));
  }, [gameType, wordStore]);

  // ── Generate question ────────────────────────────────────────────────────

  const nextQuestion = useCallback((currentPool: Word[]) => {
    if (currentPool.length < 4) return;
    const [correctWord] = pickRandom(currentPool, 1);
    const distractors = pickRandom(currentPool, 3, correctWord);
    setCorrect(correctWord);
    setChoices(shuffle([correctWord, ...distractors]));
    setAnswerState('idle');
    setPickedId(null);
  }, []);

  // ── Handle level selection ───────────────────────────────────────────────

  const handleLevelSelect = (level: LevelDef) => {
    const p = buildPool(level);
    setSelectedLevel(level);
    setPool(p);
    setScore(0);
    setStreak(0);
    setTotal(0);
    setShowLevelPicker(false);
    nextQuestion(p);
  };

  // ── Handle answer selection ──────────────────────────────────────────────

  const handlePick = (word: Word) => {
    if (answerState !== 'idle') return;
    setPickedId(word.id);
    setTotal(prev => prev + 1);

    if (word.id === correct?.id) {
      setAnswerState('correct');
      setScore(prev => prev + 1);
      setStreak(prev => prev + 1);
      advanceTimer.current = setTimeout(() => nextQuestion(pool), 600);
    } else {
      setAnswerState('wrong');
      setStreak(0);
      advanceTimer.current = setTimeout(() => nextQuestion(pool), 1200);
    }
  };

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  // Auto-load full data if not yet loaded
  useEffect(() => {
    if (!isFullyLoaded) {
      loadFullDashboard().catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Choice button styling ────────────────────────────────────────────────

  const choiceBtnClass = (word: Word): string => {
    const base = 'w-full py-4 px-3 rounded-2xl text-center font-medium text-sm transition-all border-2 active:scale-95';
    if (answerState === 'idle') {
      return `${base} bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:border-blue-400 hover:shadow-md`;
    }
    if (word.id === correct?.id) {
      return `${base} bg-green-500 border-green-500 text-white shadow-md`;
    }
    if (word.id === pickedId && answerState === 'wrong') {
      return `${base} bg-red-400 border-red-400 text-white`;
    }
    return `${base} bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 opacity-50`;
  };

  // ── Loading guard ────────────────────────────────────────────────────────

  if (!isFullyLoaded) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title={t(gameType === 'en' ? 'multiChoice.titleEn' : 'multiChoice.titleJp')} showBack />
        <main className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400 dark:text-gray-500">{t('common.loading')}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={t(gameType === 'en' ? 'multiChoice.titleEn' : 'multiChoice.titleJp')} showBack />

      <main className="flex-1 pb-24 px-4 pt-4 max-w-2xl mx-auto w-full space-y-4">

        {/* Score bar */}
        {selectedLevel && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full text-white ${LEVEL_COLORS[selectedLevel.key].split(' ')[0]}`}>
                {t(selectedLevel.labelKey)}
              </span>
              {streak >= 3 && (
                <span className="text-xs font-semibold text-orange-500">🔥 ×{streak}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {total > 0 ? `${Math.round((score / total) * 100)}%` : '—'}
              </span>
              <span className="text-sm font-bold text-blue-500">{score} pts</span>
              <button
                onClick={() => { setShowLevelPicker(true); setSelectedLevel(null); }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline"
              >
                {t('multiChoice.changeLevel')}
              </button>
            </div>
          </div>
        )}

        {/* Clue card */}
        {correct && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                {t('multiChoice.pickWord')}
              </p>
              {isLoggedIn && (
                <button
                  onClick={() => setHeartWord({ ...correct, sentence: '' } as Sentence)}
                  className="p-1 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 transition-colors shrink-0"
                  aria-label={t('userVocab.addToGroup')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-lg font-semibold text-gray-800 dark:text-gray-100 leading-snug">
              {correct.translateCh}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              {correct.translateEn}
            </p>
          </div>
        )}

        {/* 4-row choice list */}
        {correct && (
          <div className="flex flex-col gap-3">
            {choices.map(word => (
              <button
                key={word.id}
                onClick={() => handlePick(word)}
                disabled={answerState !== 'idle'}
                className={choiceBtnClass(word)}
              >
                {word.word}
              </button>
            ))}
          </div>
        )}

        {/* Feedback message */}
        {answerState !== 'idle' && correct && (
          <div className={`rounded-2xl px-4 py-3 text-sm font-medium text-center ${
            answerState === 'correct'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
          }`}>
            {answerState === 'correct'
              ? `✅ ${t('multiChoice.correct')}  +1`
              : `❌ ${t('multiChoice.wrong')}  ${t('multiChoice.answer')}: ${correct.word}`}
          </div>
        )}

      </main>

      {/* Level picker modal */}
      {showLevelPicker && (
        <LevelPickerModal
          gameType={gameType}
          onSelect={handleLevelSelect}
          onBack={() => navigate(-1)}
        />
      )}
      {heartWord && <AddToGroupModal word={heartWord} onClose={() => setHeartWord(null)} />}
    </div>
  );
};

export default MultiChoicePage;
