import React, { useCallback, useEffect, useRef, useState } from 'react';
import TapToLookup from '../../components/TapToLookup';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { OptionRow, PracticeTopBar, SheetSection } from '../../components/ui/practice';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { QuizMode, Word, Sentence } from '../../models';
import AddToGroupModal from '../../components/AddToGroupModal';
import QuizModeModal, { CHALLENGE_MODES } from '../../components/QuizModeModal';
import MatchingBoard from '../../components/quiz/MatchingBoard';
import BlastBoard from '../../components/quiz/BlastBoard';
import DropBoard from '../../components/quiz/DropBoard';
import { wordKey } from '../../components/quiz/boardUtils';
import { pronounceWord } from '../../services/tts.service';
import { explainWrongAnswer } from '../../services/llm.service';
import { useAiInsight } from '../../hooks/useAiInsight';

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
  easy:         'bg-ink hover:bg-ink/85',
  medium:       'bg-ink hover:bg-ink/85',
  intermediary: 'bg-ink hover:bg-ink/85',
  advanced:     'bg-ink hover:bg-ink/85',
  verbs:        'bg-ink hover:bg-ink/85',
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

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onBack}>
      <div
        className="bg-surface rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-sm shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink">
            {t('multiChoice.selectLevel')}
          </h3>
          <button onClick={onBack} className="text-ink-faint hover:text-ink-muted text-xl leading-none">×</button>
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
    </div>,
    document.body
  );
};

// ── Board-mode host ────────────────────────────────────────────────────────

type BoardMode = 'matching' | 'blast' | 'drop';

/** Words on the board per round. The level pool itself is never chunked — each
 *  round draws a fresh random sample from the whole level, so play is endless
 *  like the four-choice mode rather than walking a fixed set. */
const BOARD_ROUND_SIZE: Record<BoardMode, number> = { matching: 6, blast: 9, drop: 10 };

const ChallengeBoardHost: React.FC<{
  mode: BoardMode;
  pool: Sentence[];
  onRoundResult: (cleared: number, size: number) => void;
}> = ({ mode, pool, onRoundResult }) => {
  const size = Math.min(BOARD_ROUND_SIZE[mode], pool.length);
  const [round, setRound] = useState(1);
  const [words, setWords] = useState<Sentence[]>(() => pickRandom(pool, size));
  // Carried across rounds so a hot streak survives the round boundary.
  const [combo, setCombo] = useState(0);

  // Memoised: DropBoard's game loop must not see a new callback identity while
  // a round is in flight.
  const handleComplete = useCallback((failed: Map<string, number>) => {
    onRoundResult(words.filter((w) => !failed.has(wordKey(w))).length, words.length);
    setWords(pickRandom(pool, size));
    setRound((r) => r + 1);
  }, [words, pool, size, onRoundResult]);

  const common = { key: round, words, pool, onComplete: handleComplete, setIndex: round };
  if (mode === 'matching') return <MatchingBoard {...common} />;
  if (mode === 'blast') return <BlastBoard {...common} />;
  return <DropBoard {...common} autoAdvanceOnClear initialCombo={combo} onComboChange={setCombo} />;
};

// ── Main page ──────────────────────────────────────────────────────────────

const MultiChoicePage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { wordStore, isFullyLoaded, loadFullDashboard } = useData();
  const { isLoggedIn } = useAuth();
  const { showToast } = useUI();
  const [heartWord, setHeartWord] = useState<Sentence | null>(null);
  const [longPressMode, setLongPressMode] = useState<'speak' | 'copy'>('copy');
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const gameType: GameType = (location.state as { gameType?: GameType } | null)?.gameType ?? 'en';

  const [selectedLevel, setSelectedLevel] = useState<LevelDef | null>(null);
  const [pool, setPool] = useState<Sentence[]>([]);
  const [correct, setCorrect] = useState<Word | null>(null);
  const [choices, setChoices] = useState<Word[]>([]);
  const [answerState, setAnswerState] = useState<AnswerState>('idle');
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [total, setTotal] = useState(0);
  const [showLevelPicker, setShowLevelPicker] = useState(true);
  const [playMode, setPlayMode] = useState<QuizMode | null>(null);
  const [showModePicker, setShowModePicker] = useState(false);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const why = useAiInsight('mc:why');
  const [whyOpen, setWhyOpen] = useState(false);

  // ── Build pool from wordStore ────────────────────────────────────────────

  const buildPool = useCallback((level: LevelDef): Sentence[] => {
    let list: Sentence[];
    if (gameType === 'en') {
      list = wordStore.wordEnglishList;
    } else if (level.key === 'verbs') {
      list = wordStore.wordJapaneseVerbList;
    } else {
      list = wordStore.wordJapaneseList;
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
    setWhyOpen(false);
    why.clear();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle level selection ───────────────────────────────────────────────

  const handleLevelSelect = (level: LevelDef) => {
    const p = buildPool(level);
    setSelectedLevel(level);
    setPool(p);
    setScore(0);
    setStreak(0);
    setTotal(0);
    setShowLevelPicker(false);
    setShowModePicker(true);
  };

  const handleModeSelect = (mode: QuizMode) => {
    setShowModePicker(false);
    setPlayMode(mode);
    if (mode === 'choice') nextQuestion(pool);
  };

  const backToLevels = () => {
    setShowLevelPicker(true);
    setShowModePicker(false);
    setSelectedLevel(null);
    setPlayMode(null);
    setCorrect(null);
  };

  /** Board rounds score in bulk: one point per word cleared without a mistake. */
  const handleBoardRound = useCallback((cleared: number, size: number) => {
    setScore((s) => s + cleared);
    setTotal((n) => n + size);
    setStreak((s) => (cleared === size ? s + 1 : 0));
  }, []);

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

  /** Pause on a wrong answer and ask the AI why the pick was wrong. */
  const handleWhy = () => {
    const picked = choices.find(c => c.id === pickedId);
    if (!correct || !picked) return;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setWhyOpen(true);
    why.run(
      `${gameType}:${correct.id}:${picked.id}`,
      () => explainWrongAnswer((correct.translateCh || correct.translateEn || '').slice(0, 60), gameType === 'en' ? 'en' : 'jp', picked.word, correct.word),
    );
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

  // ── Long-press handlers for choice buttons ───────────────────────────────

  const handleChoicePointerDown = (word: Word) => () => {
    isLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (longPressMode === 'copy') {
        navigator.clipboard.writeText(word.word).then(() => {
          showToast(t('common.copied'), 1000);
          window.dispatchEvent(new CustomEvent('hw-chatbot-word-copied', { detail: { text: word.word } }));
        });
      } else {
        pronounceWord(word.word, gameType);
      }
    }, 600);
  };

  const handleChoicePointerUp = (word: Word) => () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (!isLongPress.current) handlePick(word);
  };

  const handleChoicePointerLeave = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  // ── Choice button styling ────────────────────────────────────────────────

  const choiceBtnClass = (word: Word): string => {
    const base = 'w-full py-4 px-3 rounded-2xl text-center font-medium text-sm transition-all border-2 active:scale-95';
    if (answerState === 'idle') {
      return `${base} bg-surface border-line text-ink hover:border-accent hover:shadow-md`;
    }
    if (word.id === correct?.id) {
      return `${base} bg-success border-success text-white shadow-md`;
    }
    if (word.id === pickedId && answerState === 'wrong') {
      return `${base} bg-danger border-danger text-white`;
    }
    return `${base} bg-surface border-line text-ink-faint opacity-50`;
  };

  // ── Loading guard ────────────────────────────────────────────────────────

  if (!isFullyLoaded) {
    return (
      <div className="flex flex-col min-h-screen bg-paper">
        <Header title={t(gameType === 'en' ? 'multiChoice.titleEn' : 'multiChoice.titleJp')} showBack />
        <main className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-[3px] border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-ink-faint">{t('common.loading')}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-paper">
      <Header title={t(gameType === 'en' ? 'multiChoice.titleEn' : 'multiChoice.titleJp')} showBack />

      <main className="flex-1 pb-24 px-4 pt-4 max-w-2xl mx-auto w-full space-y-4">

        {selectedLevel && (
          <PracticeTopBar
            left={
              <div className="flex items-baseline gap-3 text-xs text-ink-muted">
                <span className="text-ink">{t(selectedLevel.labelKey)}</span>
                <span className="tabular-nums">{score} pts</span>
                <span className="tabular-nums text-ink-faint">{total > 0 ? `${Math.round((score / total) * 100)}%` : '—'}</span>
                {streak >= 3 && <span className="tabular-nums text-accent">×{streak}</span>}
              </div>
            }
            settings={
              <SheetSection title={t('common.preferences')}>
                <OptionRow
                  label={t('scramble.longPress')}
                  value={longPressMode}
                  onChange={setLongPressMode}
                  options={[
                    { value: 'speak', label: t('scramble.longPressSpeak') },
                    { value: 'copy', label: t('scramble.longPressCopy') },
                  ]}
                />
                <button
                  onClick={backToLevels}
                  className="w-full flex items-center justify-between py-3 text-sm text-ink hover:text-accent transition-colors"
                >
                  {t('multiChoice.changeLevel')}
                  <svg className="w-4 h-4 text-ink-faint" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              </SheetSection>
            }
          />
        )}

        {/* Clue card */}
        {playMode === 'choice' && correct && (
          <div className="bg-surface rounded-2xl border border-line p-5 shadow-sm space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
                {t('multiChoice.pickWord')}
              </p>
              {isLoggedIn && (
                <button
                  onClick={() => setHeartWord({ ...correct, sentence: '' } as Sentence)}
                  className="p-1 rounded-lg text-ink-faint hover:text-danger transition-colors shrink-0"
                  aria-label={t('userVocab.addToGroup')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-lg font-semibold text-ink leading-snug">
              {correct.translateCh}
            </p>
            <p className="text-sm text-ink-muted italic">
              {correct.translateEn}
            </p>
          </div>
        )}

        {/* 4-row choice list */}
        {playMode === 'choice' && correct && (
          <div className="flex flex-col gap-3">
            {choices.map(word => (
              <button
                key={word.id}
                onPointerDown={handleChoicePointerDown(word)}
                onPointerUp={handleChoicePointerUp(word)}
                onPointerLeave={handleChoicePointerLeave}
                disabled={answerState !== 'idle'}
                className={`${choiceBtnClass(word)} touch-manipulation select-none`}
              >
                {word.word}
              </button>
            ))}
          </div>
        )}

        {/* Feedback message */}
        {playMode === 'choice' && answerState !== 'idle' && correct && (
          <div className={`rounded-2xl px-4 py-3 text-sm font-medium text-center ${
            answerState === 'correct'
              ? 'bg-success-soft text-success '
              : 'bg-danger-soft text-danger '
          }`}>
            {answerState === 'correct'
              ? `${t('multiChoice.correct')}  +1`
              : `${t('multiChoice.wrong')}  ${t('multiChoice.answer')}: ${correct.word}`}
            {answerState === 'wrong' && !whyOpen && (
              <button
                data-analytics="ai.explain_wrong"
                onClick={handleWhy}
                className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset ring-danger/30 hover:bg-danger-soft transition-colors"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
                {t('llm.explainWrong')}
              </button>
            )}
            {whyOpen && (
              <div className="mt-2 text-left font-normal">
                <p className={`text-xs leading-relaxed whitespace-pre-wrap text-ink ${why.loading ? 'animate-pulse' : ''}`}>
                  {why.loading ? t('llm.thinking') : why.error ? t('llm.error') : <TapToLookup>{why.text}</TapToLookup>}
                </p>
                <button
                  data-analytics="multichoice.why_next"
                  onClick={() => nextQuestion(pool)}
                  className="mt-3 w-full h-10 rounded-md bg-ink hover:bg-ink/85 text-paper text-sm font-medium transition-colors"
                >
                  {t('scramble.next')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Board modes — endless rounds sampled from the whole level pool */}
        {playMode && playMode !== 'choice' && pool.length > 0 && (
          <ChallengeBoardHost
            mode={playMode as BoardMode}
            pool={pool}
            onRoundResult={handleBoardRound}
          />
        )}

      </main>

      {/* Mode picker modal */}
      {showModePicker && (
        <QuizModeModal
          wordCount={pool.length}
          modes={CHALLENGE_MODES}
          storageKey="hw-challenge-mode"
          onSelect={handleModeSelect}
          onClose={backToLevels}
        />
      )}

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
