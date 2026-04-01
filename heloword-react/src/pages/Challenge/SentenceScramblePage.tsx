import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { aiExplainScramble } from '../../services/scramble.service';

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
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'jp' ? 'ja-JP' : 'en-US';
  u.rate = lang === 'jp' ? 0.85 : 0.9;
  window.speechSynthesis.speak(u);
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
    'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100 shadow-sm hover:border-blue-400 hover:shadow-md';
  const answerStyle =
    'bg-blue-500 border-blue-600 text-white shadow-sm hover:bg-blue-600';
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

// ── Main Page ──────────────────────────────────────────────────────────────

const SentenceScramblePage: React.FC = () => {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const { showToast } = useUI();
  const location = useLocation();

  const initialLang: Lang = (location.state as { lang?: Lang } | null)?.lang ?? 'jp';
  const [lang, setLang] = useState<Lang>(initialLang);
  const [chunkSize, setChunkSize] = useState(2);

  // Game state
  const [currentJp, setCurrentJp] = useState<JpSentence | null>(null);
  const [currentEn, setCurrentEn] = useState<EnSentence | null>(null);
  const [bankChunks, setBankChunks] = useState<Chunk[]>([]);
  const [usedBankUids, setUsedBankUids] = useState<Set<string>>(new Set());
  const [answerChunks, setAnswerChunks] = useState<Chunk[]>([]);
  const [originalChunks, setOriginalChunks] = useState<Chunk[]>([]);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [showTranslation, setShowTranslation] = useState(false);

  // AI state
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showLoginHint, setShowLoginHint] = useState(false);

  // Pronunciation toggle
  const [autoPronounce, setAutoPronounce] = useState(false);

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
    setShowLoginHint(false);

    if (lang === 'jp') {
      if (!jpDataRef.current) {
        setDataLoading(true);
        const mod = await import('../../data/scramble-jp.json');
        jpDataRef.current = mod.default as JpSentence[];
        setDataLoading(false);
      }
      const pool = jpDataRef.current;
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
      const pool = enDataRef.current;
      const item = pool[Math.floor(Math.random() * pool.length)];
      setCurrentEn(item);
      setCurrentJp(null);
      const orig = buildEnChunks(item.sentence, chunkSize);
      setOriginalChunks(orig);
      setBankChunks(shuffle(orig));
      setUsedBankUids(new Set());
      setAnswerChunks([]);
    }
  }, [lang, chunkSize]);

  useEffect(() => { loadSentence(); }, [loadSentence]);

  // ── Check answer ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (answerChunks.length === 0 || answerChunks.length !== originalChunks.length) return;
    if (status !== 'playing') return;

    const userText = answerChunks.map(c => c.text).join('');
    const correctText = originalChunks.map(c => c.text).join('');
    if (userText === correctText) {
      setStatus('correct');
      setShowTranslation(true);
      showToast(t('scramble.correct'), 1000);
      if (autoPronounce) speak(correctText, lang);
      autoAdvanceTimer.current = setTimeout(() => loadSentence(), 1000);
    }
  }, [answerChunks, originalChunks, status, showToast, t, autoPronounce, lang, loadSentence]);

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
    setShowLoginHint(false);
  };

  const showAnswer = () => {
    setAnswerChunks([...originalChunks]);
    setUsedBankUids(new Set(bankChunks.map(c => c.uid)));
    setStatus('correct');
    setShowTranslation(true);
  };

  const handleAiExplain = async () => {
    if (!isLoggedIn) {
      setShowLoginHint(true);
      setShowAiPanel(true);
      return;
    }
    const sentence = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;
    const translation = lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch;
    if (!sentence) return;

    setShowAiPanel(true);
    setShowLoginHint(false);
    setAiLoading(true);
    setAiResult('');
    try {
      const result = await aiExplainScramble({ lang, sentence, translation: translation ?? '' });
      setAiResult(result);
    } catch {
      setAiResult(t('scramble.aiError'));
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

  // ── Current sentence info ─────────────────────────────────────────────────

  const chineseTranslation = lang === 'jp' ? currentJp?.translation : currentEn?.translate_ch;
  const englishMeaning = lang === 'jp' ? currentJp?.english : currentEn?.sentence;
  const fullSentence = lang === 'jp' ? currentJp?.japanese : currentEn?.sentence;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={t('scramble.title')} showBack />
      <main className="flex-1 pb-24 px-4 pt-4 max-w-2xl mx-auto w-full space-y-3">

        {/* Language + EN chunk-size toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['jp', 'en'] as Lang[]).map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                lang === l
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {l === 'jp' ? '🇯🇵 Japanese' : '🇬🇧 English'}
            </button>
          ))}
          {lang === 'en' && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('scramble.chunkSize')}</span>
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  onClick={() => setChunkSize(n)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                    chunkSize === n
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Translation card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          {dataLoading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">{t('common.loading')}</p>
          ) : (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('scramble.translateCh')}</p>
              <p className="text-base font-medium text-gray-800 dark:text-gray-100 leading-relaxed">
                {chineseTranslation ?? '…'}
              </p>
              {/* Always show English for JP sentences */}
              {lang === 'jp' && currentJp?.english && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{currentJp.english}</p>
              )}
              {/* For EN mode: show the sentence only after correct/show-answer */}
              {lang === 'en' && showTranslation && (
                <p className="text-xs text-green-500 font-medium mt-1">{fullSentence}</p>
              )}
            </>
          )}
        </div>

        {/* Status feedback — always in DOM so it doesn't shift the answer zone */}
        <div className={`rounded-2xl px-4 py-2 text-sm font-semibold text-center transition-colors ${
          status === 'correct'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
            : 'invisible'
        }`}>
          {t('scramble.correct')} 🎉
        </div>

        {/* Answer zone */}
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5 px-1">
            {t('scramble.answerZone')}
          </p>
          <div
            onDragOver={handleDragOver}
            onDrop={handleDropOnAnswerZone}
            className={`min-h-[52px] flex flex-wrap gap-2 p-3 rounded-2xl border-2 border-dashed transition-colors ${
              status === 'correct'
                ? 'border-green-400 bg-green-50 dark:bg-green-900/10'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
            }`}
          >
            {answerChunks.length === 0 && (
              <span className="text-xs text-gray-300 dark:text-gray-600 self-center">
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

        {/* Word bank */}
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5 px-1">
            {t('scramble.wordBank')}
          </p>
          <div
            onDragOver={handleDragOver}
            onDrop={handleDropOnBank}
            className="min-h-[52px] flex flex-wrap gap-2 p-3 rounded-2xl bg-gray-100 dark:bg-gray-800/60"
          >
            {bankChunks.every(c => usedBankUids.has(c.uid)) && (
              <span className="text-xs text-gray-300 dark:text-gray-600 self-center">
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
                onLongPress={() => speak(chunk.text, lang)}
                onDragStart={handleDragStart('bank', chunk.uid)}
                onDragOver={handleDragOver}
                onDrop={e => { e.preventDefault(); }}
              />
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={giveHint}
            disabled={status !== 'playing'}
            className="py-2 rounded-xl text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-40 transition-colors"
          >
            💡 {t('scramble.hint')}
          </button>
          <button
            onClick={resetGame}
            className="py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            🔄 {t('scramble.reset')}
          </button>
          <button
            onClick={showAnswer}
            disabled={status === 'correct'}
            className="py-2 rounded-xl text-sm font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/50 disabled:opacity-40 transition-colors"
          >
            👁 {t('scramble.showAnswer')}
          </button>
          <button
            onClick={() => loadSentence()}
            className="py-2 rounded-xl text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            ⏭ {t('scramble.next')}
          </button>
          <button
            onClick={() => setAutoPronounce(p => !p)}
            className={`col-span-2 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              autoPronounce
                ? 'bg-teal-500 hover:bg-teal-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            🔊 {t('scramble.autoPronounce')}
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${autoPronounce ? 'bg-white/20' : 'bg-gray-300 dark:bg-gray-600'}`}>
              {autoPronounce ? t('scramble.pronounceOn') : t('scramble.pronounceOff')}
            </span>
          </button>
        </div>

        {/* AI Grammar button */}
        <button
          onClick={handleAiExplain}
          disabled={aiLoading}
          className="w-full py-2.5 rounded-2xl text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)' }}
        >
          <span>✨</span>
          <span>{t('scramble.aiExplain')}</span>
          {!isLoggedIn && <span className="text-xs opacity-75">({t('scramble.loginRequired')})</span>}
        </button>

        {/* AI panel */}
        {showAiPanel && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-purple-200 dark:border-purple-800 p-4 shadow-sm">
            <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-2">
              ✨ {t('scramble.aiGrammar')}
            </p>
            {showLoginHint ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                <p>{t('scramble.aiLoginHint')}</p>
                <a href="/login" className="text-blue-500 underline text-xs">
                  {t('common.login')} →
                </a>
              </div>
            ) : aiLoading ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">
                {t('scramble.aiThinking')}
              </p>
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                {aiResult}
              </p>
            )}
          </div>
        )}

      </main>
    </div>
  );
};

export default SentenceScramblePage;
