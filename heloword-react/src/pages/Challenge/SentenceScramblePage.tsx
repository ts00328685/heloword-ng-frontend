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
import { aiExplainScramble, aiScrambleHint, aiScrambleWrongOrder, SimilarSentence } from '../../services/scramble.service';
import WordLookupSheet from '../../components/WordLookupSheet';
import type { TappedWord } from '../../utils/wordLookup';
import { countTricky, JustSolvedStrip, recordTricky, SolvedSentence, TrickyRecap } from './ScrambleAiExtras';
import { aiErrorMessage } from '../../utils/aiError';
import AddToGroupModal from '../../components/AddToGroupModal';
import JpSentenceFilter, { applyJpFilter } from '../../components/JpSentenceFilter';
import EnDifficultyFilter, { applyEnDifficultyFilter, EN_DIFFICULTIES, EnDifficulty } from '../../components/EnDifficultyFilter';
import { Sentence } from '../../models';
import { AiDisclosure, BlockLabel, OptionRow, PracticeActions, PracticeTopBar, Segmented, SheetSection, SwitchRow } from '../../components/ui/practice';
import { pronounceWord } from '../../services/tts.service';
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
  onTap: () => void;
  onLongPress: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}> = ({ chunk, disabled, invisible, variant, onTap, onLongPress, onDragStart, onDragOver, onDrop }) => {
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
      className={`${base} ${variant === 'bank' ? bankStyle : answerStyle} ${disabled ? disabledStyle : ''} ${invisible ? invisibleStyle : ''}`}
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
  /** First tap on 提示 gives a grammar nudge (AI); the second places the chunk. */
  const [aiHintOn, setAiHintOn] = useSessionState('scramble:aiHint', true, { kind: 'local' });
  const [nudge, setNudge] = useState<{ at: number; text: string } | null>(null);
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const [wrongWhy, setWrongWhy] = useState<{ text: string; loading: boolean } | null>(null);
  /** The last solved sentence — its natural / politeness / similar actions outlive the auto-advance. */
  const [lastSolved, setLastSolved] = useSessionState<SolvedSentence | null>('scramble:lastSolved', null);
  /** The current item was generated by "one more like this". */
  const [isAiItem, setIsAiItem] = useSessionState('scramble:aiItem', false);
  const [lookupTap, setLookupTap] = useState<TappedWord | null>(null);
  const [trickyCount, setTrickyCount] = useState(() => countTricky(lang));
  useEffect(() => { setTrickyCount(countTricky(lang)); }, [lang]);

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
    setNudge(null);
    setWrongWhy(null);
    setIsAiItem(false);

    if (lang === 'jp') {
      if (!jpDataRef.current) {
        setDataLoading(true);
        const mod = await import('../../data/scramble-jp.json');
        jpDataRef.current = mod.default as JpSentence[];
        setDataLoading(false);
      }
      const pool = applyJpFilter(jpDataRef.current, filterDifficulties, selectedGroups, selectedJlpt);
      const item = pool[Math.floor(Math.random() * pool.length)];
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
      const item = pool[Math.floor(Math.random() * pool.length)];
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
      if (autoPronounce) speak(correctText, lang);
      incrementProgress(lang === 'jp' ? 'japanese' : 'english', 'scrambleSentences');
      autoAdvanceTimer.current = setTimeout(() => loadSentence(), 1000);
    }
  }, [answerChunks, originalChunks, status, showToast, t, autoPronounce, lang, loadSentence, incrementProgress, currentJp, currentEn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Interactions ─────────────────────────────────────────────────────────

  const moveFromBank = (uid: string) => {
    const chunk = bankChunks.find(c => c.uid === uid);
    if (!chunk || status !== 'playing' || usedBankUids.has(uid)) return;
    setUsedBankUids(prev => new Set([...prev, uid]));
    setAnswerChunks(prev => [...prev, chunk]);
  };

  const moveToBank = (uid: string) => {
    const chunk = answerChunks.find(c => c.uid === uid);
    if (!chunk || status !== 'playing') return;
    setAnswerChunks(prev => prev.filter(c => c.uid !== uid));
    setUsedBankUids(prev => { const s = new Set(prev); s.delete(uid); return s; });
  };

  /** Remember this sentence for today's tricky-grammar recap. */
  const markTricky = () => {
    const sentence = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    const translation = lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch;
    setTrickyCount(recordTricky(lang, sentence, translation));
  };

  /** 提示: with AI hints on, the first tap at a position gives a grammar nudge; the next places the chunk. */
  const handleHint = async () => {
    if (status !== 'playing' || nudgeLoading) return;
    markTricky();
    const at = answerChunks.length;
    if (!aiHintOn || nudge?.at === at) {
      setNudge(null);
      giveHint();
      return;
    }
    const sentence = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    if (!sentence) { giveHint(); return; }
    // Only the correctly ordered prefix counts as "placed".
    let k = 0;
    while (k < answerChunks.length && answerChunks[k].text === originalChunks[k]?.text) k++;
    const placed = answerChunks.slice(0, k).map(c => c.text).join(' / ');
    setNudgeLoading(true);
    try {
      const text = await aiScrambleHint({
        lang, sentence, placed,
        translation: (lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch) ?? '',
      });
      setNudge({ at, text });
    } catch {
      // No nudge available (quota, network) — fall back to placing the chunk.
      giveHint();
    } finally {
      setNudgeLoading(false);
    }
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
    setNudge(null);
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

  const giveHint = () => {
    if (status !== 'playing') return;
    const nextCorrect = originalChunks[answerChunks.length];
    if (!nextCorrect) return;
    const inBank = bankChunks.find(c => c.uid === nextCorrect.uid && !usedBankUids.has(c.uid));
    if (inBank) {
      setUsedBankUids(prev => new Set([...prev, inBank.uid]));
      setAnswerChunks(prev => [...prev, inBank]);
    }
  };

  const resetGame = () => {
    if (answerChunks.length > 0 && status === 'playing') markTricky();
    setNudge(null);
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
    setNudge(null);
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
                <SwitchRow label={t('scramble.autoPronounce')} checked={autoPronounce} onChange={() => setAutoPronounce(p => !p)} />
                <SwitchRow label={t('scramble.aiHintPref')} sub={t('scramble.aiHintPrefSub')} checked={aiHintOn} onChange={() => setAiHintOn(v => !v)} />
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
            {answerChunks.map(chunk => (
              <ChunkButton
                key={chunk.uid}
                chunk={chunk}
                variant="answer"
                index={0}
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

        {/* AI hint nudge for the current position */}
        {(nudgeLoading || (nudge && nudge.at === answerChunks.length && status === 'playing')) && (
          <p className="text-sm text-ink leading-relaxed border-l-2 border-accent pl-3 -mt-1 animate-slide-down">
            {nudgeLoading ? <span className="text-ink-faint animate-pulse">{t('scramble.nudgeLoading')}</span> : nudge?.text}
          </p>
        )}

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
                  : <div className="text-sm text-ink leading-relaxed space-y-2"><TapToLookup as="div"><AiMarkdown text={wrongWhy.text} /></TapToLookup></div>}
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
            {
              label: nudge && nudge.at === answerChunks.length && aiHintOn ? t('scramble.hintPlace') : t('scramble.hint'),
              onClick: handleHint,
              disabled: status !== 'playing' || nudgeLoading,
            },
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
            <TapToLookup as="div"><AiMarkdown text={aiResult} /></TapToLookup>
          </div>
        </AiDisclosure>

        <TrickyRecap lang={lang} count={trickyCount} isLoggedIn={isLoggedIn} />

        <PracticeActions
          compact
          primary={{
            label: status === 'correct' ? t('scramble.next') : t('common.skip'),
            onClick: () => loadSentence(),
            emphasis: status === 'correct',
          }}
        />

      </main>
      {heartWord && <AddToGroupModal word={heartWord} onClose={() => setHeartWord(null)} />}
      {lookupTap && (
        <WordLookupSheet tapped={lookupTap} lang={lang === 'jp' ? 'ja' : 'en'} context="scramble" onClose={() => setLookupTap(null)} />
      )}
    </div>
  );
};

export default SentenceScramblePage;
