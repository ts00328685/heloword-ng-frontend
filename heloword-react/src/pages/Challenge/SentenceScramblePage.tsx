import SentenceMeta from '../../components/SentenceMeta';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import TapToLookup from '../../components/TapToLookup';
import ReactMarkdown from 'react-markdown';
import { withFurigana } from '../../components/FuriganaText';
import { latexToUnicode } from '../../utils/latexToUnicode';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { aiExplainScramble, aiScrambleWrongOrder, SimilarSentence } from '../../services/scramble.service';
import WordLookupSheet from '../../components/WordLookupSheet';
import type { TappedWord } from '../../utils/wordLookup';
import { countTricky, JustSolvedStrip, recordTricky, SolvedSentence, takeYesterdayTricky, trickyItems, TrickyRecap } from './ScrambleAiExtras';
import { MAX_RETURNS, newRun, RETRY_GAP, RetryItem, RunEndCard, ScrambleRun, SessionBar, tapFeedback } from './ScrambleSession';
import { aiErrorMessage } from '../../utils/aiError';
import AddToGroupModal from '../../components/AddToGroupModal';
import JpSentenceFilter, { applyJpFilter } from '../../components/JpSentenceFilter';
import EnDifficultyFilter, { applyEnDifficultyFilter, EN_DIFFICULTIES, EnDifficulty, enSentenceDifficulty } from '../../components/EnDifficultyFilter';
import { Sentence } from '../../models';
import { AiDisclosure, BlockLabel, OptionRow, PracticeActions, PracticeTopBar, Segmented, SheetSection, SwitchRow } from '../../components/ui/practice';
import { cancelPronouncing, pronounceWord, speakSentence } from '../../services/tts.service';
import { useDailyGoal } from '../../contexts/DailyGoalContext';
import { readSessionState, setCodec, useSessionState } from '../../hooks/useSessionState';

// ── Types ──────────────────────────────────────────────────────────────────

interface JpSentence {
  id: string;
  japanese: string;
  chunks: string[];
  translation: string;
  english: string;
  difficulty: string;
  tags: string[];
}

interface EnSentence {
  id: number;
  translate_ch: string;
  sentence: string;
}

interface Chunk {
  text: string;
  uid: string; // unique id per slot to handle duplicates
}

type Lang = 'jp' | 'en';
type GameStatus = 'playing' | 'correct' | 'wrong';

// ── Helpers ────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildChunks(texts: string[]): Chunk[] {
  return texts.map((text, i) => ({ text, uid: `${i}-${text}` }));
}

function buildEnChunks(sentence: string, chunkSize: number): Chunk[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  const groups: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    groups.push(words.slice(i, i + chunkSize).join(' '));
  }
  return buildChunks(groups);
}

function speak(text: string, lang: Lang) {
  pronounceWord(text, lang);
}

// ── Sub-components ─────────────────────────────────────────────────────────

const ChunkButton: React.FC<{
  chunk: Chunk;
  disabled?: boolean;
  invisible?: boolean;
  variant: 'bank' | 'answer';
  index: number;
  /** Solved: chunks settle in one by one. */
  settle?: boolean;
  /** Wrong spot in a fully placed answer: a gentle shake and a red outline. */
  misplaced?: boolean;
  onTap: () => void;
  onLongPress: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}> = ({ chunk, disabled, invisible, variant, index, settle, misplaced, onTap, onLongPress, onDragStart, onDragOver, onDrop }) => {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const handlePointerDown = () => {
    isLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPress();
    }, 600);
  };

  const handlePointerUp = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (!isLongPress.current) onTap();
  };

  const handlePointerLeave = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const base =
    'select-none cursor-pointer px-3 py-1.5 rounded-xl text-sm font-medium border transition-all active:scale-95 touch-manipulation';
  const bankStyle =
    'bg-surface border-line text-ink shadow-sm hover:border-accent hover:shadow-md';
  const answerStyle =
    'bg-ink border-accent text-paper shadow-sm hover:bg-ink/85';
  const disabledStyle = 'opacity-30 cursor-not-allowed pointer-events-none';
  const invisibleStyle = 'invisible pointer-events-none';

  return (
    <div
      draggable={!disabled && !invisible}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className={`${base} ${variant === 'bank' ? bankStyle : answerStyle} ${disabled && !settle ? disabledStyle : ''} ${invisible ? invisibleStyle : ''} ${
        settle ? 'animate-chunk-settle pointer-events-none' : ''} ${misplaced ? 'animate-quiz-shake ring-2 ring-danger/60' : ''}`}
      style={settle ? { animationDelay: `${index * 60}ms` } : undefined}
    >
      {chunk.text}
    </div>
  );
};

// ── AI Markdown renderer ───────────────────────────────────────────────────

const AiMarkdown: React.FC<{ text: string }> = ({ text }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <p className="leading-relaxed">{withFurigana(children)}</p>,
      h1: ({ children }) => <p className="text-base font-semibold text-ink mt-3">{withFurigana(children)}</p>,
      h2: ({ children }) => <p className="text-sm font-semibold text-ink mt-2">{withFurigana(children)}</p>,
      h3: ({ children }) => <p className="text-sm font-semibold text-ink mt-2">{withFurigana(children)}</p>,
      strong: ({ children }) => <strong className="font-semibold">{withFurigana(children)}</strong>,
      ul: ({ children }) => <ul className="list-disc list-outside pl-5 space-y-1">{withFurigana(children)}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-outside pl-5 space-y-1">{withFurigana(children)}</ol>,
      li: ({ children }) => <li>{withFurigana(children)}</li>,
      em: ({ children }) => <em>{withFurigana(children)}</em>,
      td: ({ children }) => <td>{withFurigana(children)}</td>,
    }}
  >
    {latexToUnicode(text)}
  </ReactMarkdown>
);

// ── Main Page ──────────────────────────────────────────────────────────────

const SentenceScramblePage: React.FC = () => {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const { showToast } = useUI();
  const location = useLocation();
  const { incrementProgress } = useDailyGoal();

  // Everything below survives leaving the page (login, audio, another tab of the
  // app…): game state per browser tab, preferences & filters across visits.
  const navLang = (location.state as { lang?: Lang } | null)?.lang;
  const [lang, setLang] = useSessionState<Lang>('scramble:lang', navLang ?? 'jp');
  const [chunkSize, setChunkSize] = useSessionState('scramble:chunkSize', 2, { kind: 'local' });

  // A shortcut that names a language (e.g. Home → "JP scramble") wins — but only
  // once per navigation, so coming Back to this entry keeps the in-page choice.
  useEffect(() => {
    if (!navLang) return;
    if (readSessionState<string>('scramble:navKey') === location.key) return;
    try { sessionStorage.setItem('hw-state:scramble:navKey', JSON.stringify(location.key)); } catch {}
    setLang(navLang);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // JP sentence filters
  const [filterDifficulties, setFilterDifficulties] = useSessionState<string[]>('scramble:jpDifficulties', ['easy', 'medium', 'hard'], { kind: 'local' });
  const [selectedGroups, setSelectedGroups] = useSessionState<string[] | null>('scramble:jpGroups', null, { kind: 'local' });
  const [selectedJlpt, setSelectedJlpt] = useSessionState<string[] | null>('scramble:jpJlpt', null, { kind: 'local' });
  // EN sentence filter
  const [enDifficulties, setEnDifficulties] = useSessionState<EnDifficulty[]>('scramble:enDifficulties', [...EN_DIFFICULTIES], { kind: 'local' });

  // Game state
  const [currentJp, setCurrentJp] = useSessionState<JpSentence | null>('scramble:currentJp', null);
  const [currentEn, setCurrentEn] = useSessionState<EnSentence | null>('scramble:currentEn', null);
  const [bankChunks, setBankChunks] = useSessionState<Chunk[]>('scramble:bank', []);
  const [usedBankUids, setUsedBankUids] = useSessionState<Set<string>>('scramble:usedBank', () => new Set(), { codec: setCodec });
  const [answerChunks, setAnswerChunks] = useSessionState<Chunk[]>('scramble:answer', []);
  const [originalChunks, setOriginalChunks] = useSessionState<Chunk[]>('scramble:original', []);
  const [status, setStatus] = useSessionState<GameStatus>('scramble:status', 'playing');
  const [heartWord, setHeartWord] = useState<Sentence | null>(null);
  const [showTranslation, setShowTranslation] = useSessionState('scramble:showTranslation', false);
  // Which settings the current sentence was drawn for (see the load effect).
  const [loadedFor, setLoadedFor] = useSessionState('scramble:loadedFor', '');

  // AI state
  const [aiResult, setAiResult] = useSessionState('scramble:aiResult', '');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useSessionState('scramble:aiOpen', false);

  // Pronunciation toggle
  const [autoPronounce, setAutoPronounce] = useSessionState('scramble:autoPronounce', false, { kind: 'local' });

  // Long-press behavior toggle: 'speak' | 'copy'
  const [longPressMode, setLongPressMode] = useSessionState<'speak' | 'copy' | 'lookup'>('scramble:longPress', 'copy', { kind: 'local' });

  // AI extras
  const [wrongWhy, setWrongWhy] = useState<{ text: string; loading: boolean } | null>(null);
  /** The last solved sentence — its natural / politeness / similar actions outlive the auto-advance. */
  const [lastSolved, setLastSolved] = useSessionState<SolvedSentence | null>('scramble:lastSolved', null);
  /** The current item was generated by "one more like this". */
  const [isAiItem, setIsAiItem] = useSessionState('scramble:aiItem', false);
  const [lookupTap, setLookupTap] = useState<TappedWord | null>(null);
  const [trickyCount, setTrickyCount] = useState(() => countTricky(lang));
  useEffect(() => { setTrickyCount(countTricky(lang)); }, [lang]);

  // Session: daily set, streak, and missed sentences coming back
  const [autoNext, setAutoNext] = useSessionState('scramble:autoNext', true, { kind: 'local' });
  const [tapFx, setTapFx] = useSessionState('scramble:tapFx', false, { kind: 'local' });
  /** The current sentence got help (hint / show answer / reset / why-wrong). */
  const [helped, setHelped] = useSessionState('scramble:helped', false);
  /** The current sentence's outcome has been counted. */
  const [ticked, setTicked] = useSessionState('scramble:ticked', false);
  const [streak, setStreak] = useSessionState('scramble:streak', 0);
  const [run, setRun] = useSessionState<ScrambleRun | null>('scramble:run', null);
  const [retry, setRetry] = useSessionState<RetryItem[]>('scramble:retry', []);
  const [finishedCount, setFinishedCount] = useSessionState('scramble:finished', 0);
  /** null = a normal sentence; n = this sentence is coming back for the n-th time. */
  const [retryReturns, setRetryReturns] = useSessionState<number | null>('scramble:retryReturns', null);
  // loadSentence is memoised; it reads these through refs to see the latest values.
  const runRef = useRef(run); runRef.current = run;
  const retryRef = useRef(retry); retryRef.current = retry;
  const finishedRef = useRef(finishedCount); finishedRef.current = finishedCount;
  /** Bumped on every new sentence so a late speech callback can't advance the wrong one. */
  const advanceGen = useRef(0);

  // Yesterday's tricky sentences are mixed into today's practice, one every few sentences.
  useEffect(() => {
    const items = takeYesterdayTricky(lang);
    if (items.length === 0) return;
    setRetry(q => [
      ...q,
      ...items.map((it, i) => ({ lang, sentence: it.sentence, dueAt: finishedRef.current + 2 + i * RETRY_GAP, returns: 0 })),
    ]);
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-loaded data cache (populated on first access, never re-fetched)
  const jpDataRef = useRef<JpSentence[] | null>(null);
  const enDataRef = useRef<EnSentence[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  // Auto-advance timer
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag state
  const dragSource = useRef<{ zone: 'bank' | 'answer'; uid: string } | null>(null);

  // ── Load sentence ────────────────────────────────────────────────────────

  const loadSentence = useCallback(async () => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
    setStatus('playing');
    setShowTranslation(false);
    setAiResult('');
    setShowAiPanel(false);
    setWrongWhy(null);
    setIsAiItem(false);
    setHelped(false);
    setTicked(false);
    advanceGen.current++;

    // Which sentence text to serve next, if any: the mistakes set's queue, then a
    // missed sentence whose turn has come. Otherwise a random one from the pool.
    let wanted: string | null = null;
    let returns: number | null = null;
    const r = runRef.current;
    if (r && r.kind === 'mistakes' && !r.finishedAt && r.queue && r.queue.length > 0) {
      wanted = r.queue[0];
      setRun({ ...r, queue: r.queue.slice(1) });
    } else {
      const due = retryRef.current.find(x => x.lang === lang && x.dueAt <= finishedRef.current);
      if (due) {
        wanted = due.sentence;
        returns = due.returns + 1;
        setRetry(retryRef.current.filter(x => x !== due));
      }
    }

    if (lang === 'jp') {
      if (!jpDataRef.current) {
        setDataLoading(true);
        const mod = await import('../../data/scramble-jp.json');
        jpDataRef.current = mod.default as JpSentence[];
        setDataLoading(false);
      }
      const pool = applyJpFilter(jpDataRef.current, filterDifficulties, selectedGroups, selectedJlpt);
      const found = wanted ? jpDataRef.current.find(i => i.japanese === wanted) : undefined;
      const item = found ?? pool[Math.floor(Math.random() * pool.length)];
      setRetryReturns(found && returns !== null ? returns : null);
      setCurrentJp(item);
      setCurrentEn(null);
      const orig = buildChunks(item.chunks);
      setOriginalChunks(orig);
      setBankChunks(shuffle(orig));
      setUsedBankUids(new Set());
      setAnswerChunks([]);
    } else {
      if (!enDataRef.current) {
        setDataLoading(true);
        const mod = await import('../../data/scramble-en.json');
        enDataRef.current = mod.default as EnSentence[];
        setDataLoading(false);
      }
      const pool = applyEnDifficultyFilter(enDataRef.current, enDifficulties);
      const found = wanted ? enDataRef.current.find(i => i.sentence === wanted) : undefined;
      const item = found ?? pool[Math.floor(Math.random() * pool.length)];
      setRetryReturns(found && returns !== null ? returns : null);
      setCurrentEn(item);
      setCurrentJp(null);
      const orig = buildEnChunks(item.sentence, chunkSize);
      setOriginalChunks(orig);
      setBankChunks(shuffle(orig));
      setUsedBankUids(new Set());
      setAnswerChunks([]);
    }
  }, [lang, chunkSize, filterDifficulties, selectedGroups, selectedJlpt, enDifficulties]);

  // Draw a new sentence when the settings change — but not when we come back to
  // the page with a sentence still in progress for the same settings.
  const configKey = JSON.stringify([lang, chunkSize, filterDifficulties, selectedGroups, selectedJlpt, enDifficulties]);
  useEffect(() => {
    const hasSentence = lang === 'jp' ? !!currentJp : !!currentEn;
    if (hasSentence && loadedFor === configKey) return;
    setLoadedFor(configKey);
    loadSentence();
  }, [loadSentence]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check answer ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (answerChunks.length === 0 || answerChunks.length !== originalChunks.length) return;
    if (status !== 'playing') return;

    const userText = answerChunks.map(c => c.text).join('');
    const correctText = originalChunks.map(c => c.text).join('');
    if (userText === correctText) {
      setStatus('correct');
      setShowTranslation(true);
      const solvedSentence = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
      if (solvedSentence) {
        setLastSolved({ lang, sentence: solvedSentence, translation: (lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch) ?? '' });
      }
      showToast(t('scramble.correct'), 1000);
      incrementProgress(lang === 'jp' ? 'japanese' : 'english', 'scrambleSentences');
      const finishesRun = settle(!helped);
      // Read the whole sentence (if on), and only then move on (if on) — so the
      // reading is never cut off. The last sentence of a set stays for the end card.
      const gen = advanceGen.current;
      const advance = (delay: number) => {
        if (!autoNext || finishesRun) return;
        if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
        autoAdvanceTimer.current = setTimeout(() => { if (gen === advanceGen.current) loadSentence(); }, delay);
      };
      if (autoPronounce) {
        let done = false;
        const after = () => { if (!done) { done = true; advance(500); } };
        speakSentence(correctText, lang === 'jp' ? 'ja-JP' : 'en-US', {}, after);
        setTimeout(after, 9000); // never wait forever (no voices, blocked audio)
      } else {
        advance(1000);
      }
    }
  }, [answerChunks, originalChunks, status, showToast, t, autoPronounce, lang, loadSentence, incrementProgress, currentJp, currentEn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Interactions ─────────────────────────────────────────────────────────

  const moveFromBank = (uid: string) => {
    const chunk = bankChunks.find(c => c.uid === uid);
    if (!chunk || status !== 'playing' || usedBankUids.has(uid)) return;
    if (tapFx) tapFeedback();
    setUsedBankUids(prev => new Set([...prev, uid]));
    setAnswerChunks(prev => [...prev, chunk]);
  };

  const moveToBank = (uid: string) => {
    const chunk = answerChunks.find(c => c.uid === uid);
    if (!chunk || status !== 'playing') return;
    if (tapFx) tapFeedback();
    setAnswerChunks(prev => prev.filter(c => c.uid !== uid));
    setUsedBankUids(prev => { const s = new Set(prev); s.delete(uid); return s; });
  };

  /** Remember this sentence for today's tricky-grammar recap. */
  const markTricky = () => {
    const sentence = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    const translation = lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch;
    setTrickyCount(recordTricky(lang, sentence, translation));
    setHelped(true);
  };

  /**
   * Count the current sentence once: streak, set progress, and — if it wasn't a
   * clean solve — bring it back a few sentences later. Returns true when this
   * finishes the current set.
   */
  const settle = (clean: boolean): boolean => {
    if (ticked) return false;
    setTicked(true);
    const nextStreak = clean ? streak + 1 : 0;
    setStreak(nextStreak);
    setFinishedCount(n => n + 1);
    const sentence = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    if (!clean && sentence && !isAiItem && (retryReturns ?? 0) < MAX_RETURNS) {
      setRetry(q => [
        ...q.filter(x => !(x.lang === lang && x.sentence === sentence)),
        { lang, sentence, dueAt: finishedRef.current + 1 + RETRY_GAP, returns: retryReturns ?? 0 },
      ]);
    }
    let finishes = false;
    if (run && !run.finishedAt) {
      const done = run.done + 1;
      finishes = done >= run.total;
      setRun({
        ...run,
        done,
        clean: run.clean + (clean ? 1 : 0),
        bestStreak: Math.max(run.bestStreak, nextStreak),
        finishedAt: finishes ? Date.now() : undefined,
      });
    }
    return finishes;
  };

  /** Skip / Next. A skipped sentence counts as missed (and comes back). */
  const goNext = () => {
    cancelPronouncing();
    // Skipping means "didn't know it": it joins today's mistakes too.
    if (status === 'playing') markTricky();
    const finishes = status === 'playing' ? settle(false) : false;
    if (finishes || (run?.finishedAt)) return;
    // Let the counters above render first: the next pick reads them.
    setTimeout(() => loadSentence(), 0);
  };

  const ensureData = async (l: Lang) => {
    if (l === 'jp' && !jpDataRef.current) jpDataRef.current = (await import('../../data/scramble-jp.json')).default as JpSentence[];
    if (l === 'en' && !enDataRef.current) enDataRef.current = (await import('../../data/scramble-en.json')).default as EnSentence[];
  };

  const startDaily = () => {
    setRun(newRun('daily'));
    setTimeout(() => loadSentence(), 0);
  };

  /** Replay today's tricky sentences (those still in the built-in sets) as a set. */
  const startMistakes = async () => {
    await ensureData(lang);
    const known = (s: string) => lang === 'jp'
      ? !!jpDataRef.current?.some(i => i.japanese === s)
      : !!enDataRef.current?.some(i => i.sentence === s);
    const queue = [...new Set(trickyItems(lang).map(i => i.sentence))].filter(known).slice(-10);
    if (queue.length === 0) { showToast(t('scramble.noMistakes'), 1500); return; }
    setRun(newRun('mistakes', queue));
    setTimeout(() => loadSentence(), 0);
  };

  const endRun = () => setRun(null);

  /** 提示: place the next correct chunk (and remember the sentence for today's recap). */
  const handleHint = () => {
    if (status !== 'playing') return;
    markTricky();
    giveHint();
  };

  /** Ask why a fully placed answer is in the wrong order. */
  const handleWhyWrong = async () => {
    const sentence = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    if (!sentence) return;
    markTricky();
    setWrongWhy({ text: '', loading: true });
    try {
      const text = await aiScrambleWrongOrder({
        lang, sentence,
        attempt: answerChunks.map(c => c.text).join(' / '),
        translation: (lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch) ?? '',
      });
      setWrongWhy({ text, loading: false });
    } catch (e) {
      setWrongWhy({
        text: (e as Error)?.message?.startsWith('AI_') ? aiErrorMessage(e, isLoggedIn) : t('scramble.aiError'),
        loading: false,
      });
    }
  };

  /** Play an AI-generated sentence ("one more like this") right away. */
  const playSimilar = (item: SimilarSentence, itemLang: Lang) => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
    setStatus('playing');
    setShowTranslation(false);
    setAiResult('');
    setShowAiPanel(false);
    setWrongWhy(null);
    let orig: Chunk[];
    if (itemLang === 'jp') {
      setCurrentJp({
        id: `ai-${Date.now()}`, japanese: item.sentence, chunks: item.chunks,
        translation: item.translation, english: item.english, difficulty: '', tags: [],
      });
      setCurrentEn(null);
      orig = buildChunks(item.chunks);
    } else {
      setCurrentEn({ id: -1, translate_ch: item.translation, sentence: item.sentence });
      setCurrentJp(null);
      orig = buildEnChunks(item.sentence, chunkSize);
    }
    setOriginalChunks(orig);
    setBankChunks(shuffle(orig));
    setUsedBankUids(new Set());
    setAnswerChunks([]);
    setIsAiItem(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * Place the next correct chunk. Keeps the correctly ordered start of the answer;
   * anything after the first mistake goes back to the bank first (it used to do
   * nothing when a needed chunk was already placed in the wrong spot, or when every
   * chunk was placed in the wrong order). Chunks compare by text, so duplicates
   * like two は are interchangeable.
   */
  const giveHint = () => {
    if (status !== 'playing') return;
    let k = 0;
    while (k < answerChunks.length && answerChunks[k].text === originalChunks[k]?.text) k++;
    const target = originalChunks[k];
    if (!target) return;
    const kept = answerChunks.slice(0, k);
    const keptUids = new Set(kept.map(c => c.uid));
    const pick = bankChunks.find(c => c.text === target.text && !keptUids.has(c.uid));
    if (!pick) return;
    setAnswerChunks([...kept, pick]);
    setUsedBankUids(new Set([...keptUids, pick.uid]));
    if (answerChunks.length > k) showToast(t('scramble.hintReturned'), 1500);
  };

  const resetGame = () => {
    if (answerChunks.length > 0 && status === 'playing') markTricky();
    setWrongWhy(null);
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
    setStatus('playing');
    setShowTranslation(false);
    setBankChunks(shuffle([...originalChunks]));
    setUsedBankUids(new Set());
    setAnswerChunks([]);
    setAiResult('');
    setShowAiPanel(false);
  };

  const showAnswer = () => {
    markTricky();
    settle(false);
    setWrongWhy(null);
    const solvedSentence = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    if (solvedSentence) {
      setLastSolved({ lang, sentence: solvedSentence, translation: (lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch) ?? '' });
    }
    setAnswerChunks([...originalChunks]);
    setUsedBankUids(new Set(bankChunks.map(c => c.uid)));
    setStatus('correct');
    setShowTranslation(true);
  };

  const handleAiExplain = async () => {
    const sentence = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    const translation = lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch;
    if (!sentence) return;

    setShowAiPanel(true);
    setAiLoading(true);
    setAiResult('');
    try {
      const result = await aiExplainScramble({ lang, sentence, translation: translation ?? '' });
      setAiResult(result);
    } catch (e) {
      setAiResult((e as Error)?.message?.startsWith('AI_') ? aiErrorMessage(e, isLoggedIn) : t('scramble.aiError'));
    } finally {
      setAiLoading(false);
    }
  };

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDragStart = (zone: 'bank' | 'answer', uid: string) => (e: React.DragEvent) => {
    dragSource.current = { zone, uid };
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Drop onto an answer slot — insert before that slot
  const handleDropOnAnswer = (targetUid: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragSource.current;
    if (!src || status !== 'playing') return;

    if (src.zone === 'bank') {
      const chunk = bankChunks.find(c => c.uid === src.uid);
      if (!chunk) return;
      setUsedBankUids(prev => new Set([...prev, src.uid]));
      setAnswerChunks(prev => {
        const idx = prev.findIndex(c => c.uid === targetUid);
        const next = [...prev];
        next.splice(idx, 0, chunk);
        return next;
      });
    } else {
      setAnswerChunks(prev => {
        const fromIdx = prev.findIndex(c => c.uid === src.uid);
        const toIdx = prev.findIndex(c => c.uid === targetUid);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return next;
      });
    }
    dragSource.current = null;
  };

  // Drop onto the answer zone (empty area after last chunk)
  const handleDropOnAnswerZone = (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragSource.current;
    if (!src || status !== 'playing') return;
    if (src.zone === 'bank') {
      const chunk = bankChunks.find(c => c.uid === src.uid);
      if (!chunk) return;
      setUsedBankUids(prev => new Set([...prev, src.uid]));
      setAnswerChunks(prev => [...prev, chunk]);
    }
    dragSource.current = null;
  };

  // Drop back onto bank zone
  const handleDropOnBank = (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragSource.current;
    if (!src || src.zone !== 'answer' || status !== 'playing') return;
    if (!answerChunks.find(c => c.uid === src.uid)) return;
    setAnswerChunks(prev => prev.filter(c => c.uid !== src.uid));
    setUsedBankUids(prev => { const s = new Set(prev); s.delete(src.uid); return s; });
    dragSource.current = null;
  };

  const handleBankLongPress = (text: string) => {
    if (longPressMode === 'lookup') {
      const sentence = (lang === 'jp' ? currentJp?.japanese : currentEn?.sentence) ?? text;
      setLookupTap({ word: text, start: 0, end: 0, sentence, sentenceText: sentence });
      return;
    }
    if (longPressMode === 'copy') {
      navigator.clipboard.writeText(text).then(() => {
        showToast(t('common.copied'), 1000);
        window.dispatchEvent(new CustomEvent('hw-chatbot-word-copied', { detail: { text } }));
      });
    } else {
      speak(text, lang);
    }
  };

  // A wrong-order explanation belongs to that exact arrangement.
  const arrangement = answerChunks.map(c => c.uid).join(',');
  useEffect(() => { setWrongWhy(null); }, [arrangement]);

  const isWrongOrder = status === 'playing'
    && originalChunks.length > 0
    && answerChunks.length === originalChunks.length
    && answerChunks.map(c => c.text).join('') !== originalChunks.map(c => c.text).join('');

  // ── Current sentence info ─────────────────────────────────────────────────

  const chineseTranslation = lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch;
  const englishMeaning = lang === 'jp' ? currentJp?.english : currentEn?.sentence;
  const fullSentence = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-paper">
      <Header title={t('scramble.title')} showBack />
      <main className="flex-1 pb-24 px-4 pt-4 max-w-2xl mx-auto w-full space-y-4">

        <PracticeTopBar
          furigana={lang === 'jp'}
          left={
            <Segmented
              value={lang}
              onChange={setLang}
              options={[{ value: 'jp', label: '日本語' }, { value: 'en', label: 'English' }]}
            />
          }
          settings={
            <>
              <SheetSection title={t('common.filters')}>
                {lang === 'en' ? (
                  <EnDifficultyFilter selected={enDifficulties} onChange={setEnDifficulties} />
                ) : (
                  <JpSentenceFilter
                    selectedDifficulties={filterDifficulties}
                    onDifficultiesChange={setFilterDifficulties}
                    selectedJlpt={selectedJlpt}
                    onJlptChange={setSelectedJlpt}
                    selectedGroups={selectedGroups}
                    onGroupsChange={setSelectedGroups}
                  />
                )}
              </SheetSection>
              <SheetSection title={t('common.preferences')}>
                {lang === 'en' && (
                  <OptionRow
                    label={t('scramble.chunkSize')}
                    value={chunkSize}
                    onChange={setChunkSize}
                    options={[1, 2, 3].map(n => ({ value: n, label: String(n) }))}
                  />
                )}
                <SwitchRow label={t('scramble.readAloudOnCorrect')} sub={t('scramble.readAloudOnCorrectSub')} checked={autoPronounce} onChange={() => setAutoPronounce(p => !p)} />
                <SwitchRow label={t('scramble.autoNext')} sub={t('scramble.autoNextSub')} checked={autoNext} onChange={() => setAutoNext(v => !v)} />
                <SwitchRow label={t('scramble.tapFx')} sub={t('scramble.tapFxSub')} checked={tapFx} onChange={() => setTapFx(v => !v)} />
                <OptionRow
                  label={t('scramble.longPress')}
                  value={longPressMode}
                  onChange={setLongPressMode}
                  options={[
                    { value: 'speak', label: t('scramble.longPressSpeak') },
                    { value: 'copy', label: t('scramble.longPressCopy') },
                    { value: 'lookup', label: t('scramble.longPressLookup') },
                  ]}
                />
              </SheetSection>
            </>
          }
        />

        <SessionBar run={run} streak={streak} counted={ticked} onStartDaily={startDaily} onEndRun={endRun} />

        {run?.finishedAt ? (
          <>
            <RunEndCard
              run={run}
              mistakesCount={trickyCount}
              onAgain={startDaily}
              onMistakes={startMistakes}
              onFree={() => { setRun(null); setTimeout(() => loadSentence(), 0); }}
            />
            <TrickyRecap lang={lang} count={trickyCount} isLoggedIn={isLoggedIn} />
          </>
        ) : (<>

        {/* Translation card */}
        <div className="bg-surface rounded-2xl border border-line p-4 shadow-sm">
          {dataLoading ? (
            <p className="text-sm text-ink-faint animate-pulse">{t('common.loading')}</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-ink-muted flex items-center gap-2">
                  {t('scramble.translateCh')}
                  {isAiItem && <span className="text-[11px] px-1.5 py-0.5 rounded border border-accent/40 text-accent">{t('scramble.aiItem')}</span>}
                  {retryReturns !== null && !isAiItem && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded border border-line text-ink-muted">{t('scramble.retryTag')}</span>
                  )}
                  {!isAiItem && (
                    <SentenceMeta
                      difficulty={lang === 'jp' ? currentJp?.difficulty : currentEn ? enSentenceDifficulty(currentEn.sentence) : undefined}
                      tags={lang === 'jp' ? currentJp?.tags : []}
                    />
                  )}
                </p>
                {isLoggedIn && (lang === 'jp' ? currentJp : currentEn) && (
                  <button
                    onClick={() => {
                      const w: Sentence = lang === 'jp' && currentJp
                        ? { id: 0, word: currentJp.japanese, translateEn: currentJp.english || '', translateCh: currentJp.translation, sentence: currentJp.japanese, language: 'jp', status: 1 }
                        : { id: (currentEn as EnSentence).id, word: (currentEn as EnSentence).sentence, translateEn: (currentEn as EnSentence).sentence, translateCh: (currentEn as EnSentence).translate_ch || '', sentence: (currentEn as EnSentence).sentence, language: 'en', status: 1 };
                      setHeartWord(w);
                    }}
                    className="p-1 rounded-lg text-ink-faint hover:text-danger transition-colors"
                    aria-label={t('userVocab.addToGroup')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                )}
              </div>
              <p className="text-base font-medium text-ink leading-relaxed">
                {chineseTranslation ?? '…'}
              </p>
              {/* Always show English for JP sentences */}
              {lang === 'jp' && currentJp?.english && (
                <p className="text-xs text-ink-faint mt-1">{currentJp.english}</p>
              )}
              {/* For EN mode: show the sentence only after correct/show-answer */}
              {lang === 'en' && showTranslation && (
                <p className="text-xs text-success font-medium mt-1">{fullSentence}</p>
              )}
            </>
          )}
        </div>

        {/* Status feedback — fixed height so the answer zone doesn't jump */}
        <p className={`h-5 text-sm text-center text-success ${status === 'correct' ? '' : 'invisible'}`}>
          {t('scramble.correct')}
        </p>

        {/* Answer zone */}
        <div>
          <BlockLabel>{t('scramble.answerZone')}</BlockLabel>
          <div
            onDragOver={handleDragOver}
            onDrop={handleDropOnAnswerZone}
            className={`min-h-[52px] flex flex-wrap gap-2 p-3 rounded-2xl border-2 border-dashed transition-colors ${
              status === 'correct'
                ? 'border-success bg-success-soft '
                : 'border-line bg-surface '
            }`}
          >
            {answerChunks.length === 0 && (
              <span className="text-xs text-ink-faint self-center">
                {t('scramble.dropHere')}
              </span>
            )}
            {answerChunks.map((chunk, i) => (
              <ChunkButton
                key={chunk.uid}
                chunk={chunk}
                variant="answer"
                index={i}
                settle={status === 'correct'}
                misplaced={isWrongOrder && chunk.text !== originalChunks[i]?.text}
                disabled={status !== 'playing'}
                onTap={() => moveToBank(chunk.uid)}
                onLongPress={() => speak(chunk.text, lang)}
                onDragStart={handleDragStart('answer', chunk.uid)}
                onDragOver={handleDragOver}
                onDrop={handleDropOnAnswer(chunk.uid)}
              />
            ))}
          </div>
        </div>

        {/* All chunks placed but the order is wrong — say so, and offer an AI explanation */}
        {isWrongOrder && (
          <div className="-mt-1 space-y-2 animate-slide-down">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-danger">{t('scramble.wrongOrder')}</span>
              {!wrongWhy && (
                <button
                  data-analytics="ai.scramble_wrong_order"
                  onClick={handleWhyWrong}
                  className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line text-xs text-ink hover:border-ink/30 transition-colors"
                >
                  <svg className="w-2.5 h-2.5 text-accent" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z" /></svg>
                  {t('scramble.aiWhyWrong')}
                </button>
              )}
            </div>
            {wrongWhy && (
              <div className="border-l-2 border-accent pl-3">
                {wrongWhy.loading
                  ? <p className="text-sm text-ink-faint animate-pulse">{t('scramble.aiThinking')}</p>
                  : <div className="text-sm text-ink leading-relaxed space-y-2"><TapToLookup as="div" hint><AiMarkdown text={wrongWhy.text} /></TapToLookup></div>}
              </div>
            )}
          </div>
        )}

        {/* Word bank */}
        <div>
          <BlockLabel>{t('scramble.wordBank')}</BlockLabel>
          <div
            onDragOver={handleDragOver}
            onDrop={handleDropOnBank}
            className="min-h-[52px] flex flex-wrap gap-2 p-3 rounded-2xl bg-ink/5"
          >
            {bankChunks.every(c => usedBankUids.has(c.uid)) && (
              <span className="text-xs text-ink-faint self-center">
                {t('scramble.bankEmpty')}
              </span>
            )}
            {bankChunks.map(chunk => (
              <ChunkButton
                key={chunk.uid}
                chunk={chunk}
                variant="bank"
                index={0}
                invisible={usedBankUids.has(chunk.uid)}
                onTap={() => moveFromBank(chunk.uid)}
                onLongPress={() => handleBankLongPress(chunk.text)}
                onDragStart={handleDragStart('bank', chunk.uid)}
                onDragOver={handleDragOver}
                onDrop={e => { e.preventDefault(); }}
              />
            ))}
          </div>
        </div>

        <PracticeActions
          tools={[
            { label: t('scramble.hint'), onClick: handleHint, disabled: status !== 'playing' },
            { label: t('scramble.showAnswer'), onClick: showAnswer, disabled: status === 'correct' },
            { label: t('scramble.reset'), onClick: resetGame },
          ]}
        />

        {lastSolved && lastSolved.lang === lang && (
          <JustSolvedStrip solved={lastSolved} isLoggedIn={isLoggedIn} onPlay={playSimilar} />
        )}

        <AiDisclosure
          label={t('scramble.aiExplain')}
          analytics="ai.scramble_explain"
          open={showAiPanel}
          loading={aiLoading}
          loadingText={t('scramble.aiThinking')}
          onToggle={() => (showAiPanel ? setShowAiPanel(false) : aiResult ? setShowAiPanel(true) : handleAiExplain())}
        >
          <div className="text-sm text-ink leading-relaxed space-y-2">
            <TapToLookup as="div" hint><AiMarkdown text={aiResult} /></TapToLookup>
          </div>
        </AiDisclosure>

        <TrickyRecap lang={lang} count={trickyCount} isLoggedIn={isLoggedIn} />

        <PracticeActions
          compact
          primary={{
            label: status === 'correct' ? t('scramble.next') : t('common.skip'),
            onClick: goNext,
            emphasis: status === 'correct',
          }}
        />
        </>)}

      </main>
      {heartWord && <AddToGroupModal word={heartWord} onClose={() => setHeartWord(null)} />}
      {lookupTap && (
        <WordLookupSheet tapped={lookupTap} lang={lang === 'jp' ? 'ja' : 'en'} context="scramble" onClose={() => setLookupTap(null)} />
      )}
    </div>
  );
};

export default SentenceScramblePage;
