import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import OnboardingModal from '../../components/OnboardingModal';
import AddToGroupModal from '../../components/AddToGroupModal';
import MultiChoicePanel from '../../components/MultiChoicePanel';
import { Sentence } from '../../models';
import { pronounceWord } from '../../services/tts.service';
import { getWordInsight } from '../../services/llm.service';
import { useAiInsight } from '../../hooks/useAiInsight';
import { useAuth } from '../../contexts/AuthContext';

const PREVIEW_ONBOARDING_KEY = 'onboarding:word_preview';

interface PreviewState {
  words: Sentence[];
  groupName: string;
}

/* Reusable insight panel rendered below a card */
const InsightPanel: React.FC<{
  isLoggedIn: boolean;
  loading: boolean;
  error: boolean;
  text: string;
  noLoginLabel: string;
  thinkingLabel: string;
  errorLabel: string;
  onRetry: () => void;
}> = ({ isLoggedIn, loading, error, text, noLoginLabel, thinkingLabel, errorLabel, onRetry }) => (
  <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-3 ring-1 ring-inset ring-gray-100 dark:ring-gray-700">
    {!isLoggedIn ? (
      <p className="text-xs text-gray-400 dark:text-gray-500 italic">{noLoginLabel}</p>
    ) : loading ? (
      <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">{thinkingLabel}</p>
    ) : error ? (
      <div className="flex items-center gap-2">
        <p className="text-xs text-red-400">{errorLabel}</p>
        <button onClick={onRetry} className="text-xs text-blue-400 underline">↺</button>
      </div>
    ) : (
      <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{text}</p>
    )}
  </div>
);

/* Reusable star-pill insight toggle button */
const InsightButton: React.FC<{
  active: boolean;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}> = ({ active, label, onClick, onPointerDown }) => (
  <button
    onClick={onClick}
    onPointerDown={onPointerDown}
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide transition-all duration-150 ${
      active
        ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 ring-1 ring-gray-800 dark:ring-gray-100'
        : 'text-gray-400 dark:text-gray-500 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-gray-400 dark:hover:ring-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
    }`}
  >
    <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z" />
    </svg>
    {active ? `${label} ▲` : label}
  </button>
);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PAGE_SIZE = 50;

const WordPreviewPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as PreviewState | null;
  const { isLoggedIn } = useAuth();

  const words: Sentence[] = state?.words ?? [];
  const groupName: string = state?.groupName ?? '';

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(PREVIEW_ONBOARDING_KEY));
  const dismissOnboarding = () => { localStorage.setItem(PREVIEW_ONBOARDING_KEY, '1'); setShowOnboarding(false); };

  // Search & shuffle
  const [query, setQuery] = useState('');
  const [shuffled, setShuffled] = useState(false);
  const [shuffledWords, setShuffledWords] = useState<Sentence[]>(words);

  // Original 1-based index keyed by word id — stable across shuffle/filter
  const originalIndex = useMemo(() => new Map(words.map((w, i) => [w.id, i + 1])), [words]);

  // displayWords: apply shuffle order first, then filter by query
  const displayWords = useMemo(() => {
    const base = shuffled ? shuffledWords : words;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(w =>
      w.word.toLowerCase().includes(q) ||
      (w.translateEn || '').toLowerCase().includes(q) ||
      (w.translateCh || '').toLowerCase().includes(q)
    );
  }, [shuffled, shuffledWords, words, query]);

  // Incremental rendering — only render PAGE_SIZE items at a time in list mode
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when displayWords changes (query/shuffle)
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [displayWords]);

  // IntersectionObserver: load next page when sentinel scrolls into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, displayWords.length));
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [displayWords.length]);

  // List mode revealed state — keyed by word id so it survives reorder/filter
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const allHidden = displayWords.every(w => !revealedIds.has(w.id));
  const allRevealed = displayWords.length > 0 && displayWords.every(w => revealedIds.has(w.id));

  const toggleReveal = (id: number) => {
    setRevealedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const hideAll = () => setRevealedIds(new Set());
  const showAll = () => setRevealedIds(new Set(displayWords.map(w => w.id)));

  // Flashcard mode state
  const [flashMode, setFlashMode] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Multi-choice mode state
  const [multiMode, setMultiMode] = useState(false);

  // Drag / swipe state
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const [exitDir, setExitDir] = useState<'left' | 'right' | null>(null);
  const [enterDir, setEnterDir] = useState<'left' | 'right' | null>(null);
  const exitingRef = useRef(false);

  // AI insight
  const insight = useAiInsight('preview:insight');
  const [selectedWordId, setSelectedWordId] = useState<number | null>(null);
  const [heartWord, setHeartWord] = useState<Sentence | null>(null);

  if (!state || words.length === 0) {
    navigate(-1);
    return null;
  }

  const wordLang = (w: Sentence) =>
    w.language === 'jp' || w.language === 'ja' ? 'jp' : 'en';

  const runInsight = (word: Sentence) => {
    if (selectedWordId === word.id) {
      setSelectedWordId(null);
      insight.clear();
      return;
    }
    setSelectedWordId(word.id);
    if (!isLoggedIn) return;
    insight.run(
      String(word.id),
      () => getWordInsight(word.word || '', word.translateEn || '', word.translateCh || '', i18n.language, wordLang(word)),
    );
  };

  // ── Shuffle toggle ──────────────────────────────────────────────────────────

  const toggleShuffle = () => {
    const next = !shuffled;
    setShuffled(next);
    if (next) setShuffledWords(shuffle(words));
    setCardIndex(0);
    setFlipped(false);
    setDragX(0);
    clearInsight();
  };

  // ── Flashcard navigation ────────────────────────────────────────────────────

  const clearInsight = () => { setSelectedWordId(null); insight.clear(); };

  const goNext = () => {
    if (exitingRef.current || cardIndex >= displayWords.length - 1) return;
    exitingRef.current = true;
    clearInsight();
    setExitDir('left');
    setTimeout(() => {
      setCardIndex((i) => i + 1);
      setFlipped(false);
      setDragX(0);
      setExitDir(null);
      setEnterDir('right');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setEnterDir(null);
        setTimeout(() => { exitingRef.current = false; }, 320);
      }));
    }, 280);
  };

  const goPrev = () => {
    if (exitingRef.current || cardIndex <= 0) return;
    exitingRef.current = true;
    clearInsight();
    setExitDir('right');
    setTimeout(() => {
      setCardIndex((i) => i - 1);
      setFlipped(false);
      setDragX(0);
      setExitDir(null);
      setEnterDir('left');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setEnterDir(null);
        setTimeout(() => { exitingRef.current = false; }, 320);
      }));
    }, 280);
  };

  // ── Pointer events (swipe + tap) ────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (exitingRef.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartX.current = e.clientX;
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartX.current;
    dragXRef.current = dx;
    setDragX(dx);
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    const dist = dragXRef.current;
    dragXRef.current = 0;
    if (Math.abs(dist) < 10) {
      setFlipped((f) => !f);
      setDragX(0);
    } else if (dist < -60) {
      goNext();
    } else if (dist > 60) {
      goPrev();
    } else {
      setDragX(0);
    }
  };

  // ── Card transform ──────────────────────────────────────────────────────────

  const cardStyle = (): React.CSSProperties => {
    if (exitDir === 'left')  return { transform: 'translateX(-130vw) rotate(-12deg)', transition: 'transform 0.28s ease-in, opacity 0.28s ease-in', opacity: 0 };
    if (exitDir === 'right') return { transform: 'translateX(130vw) rotate(12deg)',   transition: 'transform 0.28s ease-in, opacity 0.28s ease-in', opacity: 0 };
    if (enterDir === 'right') return { transform: 'translateX(130vw)',  transition: 'none', opacity: 0 };
    if (enterDir === 'left')  return { transform: 'translateX(-130vw)', transition: 'none', opacity: 0 };
    if (isDragging) return { transform: `translateX(${dragX}px) rotate(${dragX * 0.025}deg)`, transition: 'none' };
    return { transform: 'translateX(0) rotate(0deg)', transition: 'transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.32s ease', opacity: 1 };
  };

  const currentWord = displayWords[cardIndex];
  const flashInsightOpen = selectedWordId === currentWord?.id;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col animate-page-enter">
      <Header title={groupName || t('review.preview')} showBack />

      {/* Toolbar */}
      <div className="sticky top-14 z-10 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-2xl mx-auto px-4 pt-2 pb-2 space-y-2">

          {/* Search row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setCardIndex(0); }}
                placeholder={t('review.previewSearch', 'Search words…')}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setCardIndex(0); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Shuffle toggle */}
            <button
              onClick={toggleShuffle}
              title={shuffled ? t('review.previewUnshuffle', 'Original order') : t('review.previewShuffle', 'Shuffle')}
              className={`shrink-0 p-1.5 rounded-lg border transition-colors ${
                shuffled
                  ? 'bg-purple-500 border-purple-500 text-white'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 3h5v5M4 20l16-16M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
            </button>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {query
                ? t('review.previewFiltered', { shown: displayWords.length, total: words.length })
                : t('review.previewWordCount', { count: words.length })}
            </p>
            <div className="flex gap-1.5 items-center">
              <button
                onClick={() => { setFlashMode((m) => !m); setMultiMode(false); setCardIndex(0); setFlipped(false); setDragX(0); clearInsight(); }}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  flashMode
                    ? 'bg-blue-500 border-blue-500 text-white shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                {t('review.flashcardMode')}
              </button>

              <button
                onClick={() => { if (multiMode) { setMultiMode(false); } else { setFlashMode(false); setMultiMode(true); } }}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  multiMode
                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('review.multiChoiceMode')}
              </button>

              {!flashMode && (
                <>
                  <button onClick={hideAll} disabled={allHidden} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-40 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
                    {t('review.previewHideAll')}
                  </button>
                  <button onClick={showAll} disabled={allRevealed} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-40 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
                    {t('review.previewShowAll')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {multiMode ? (
        /* ── MULTI-CHOICE MODE ── */
        <MultiChoicePanel words={displayWords} onExit={() => setMultiMode(false)} />
      ) : flashMode ? (
        /* ── FLASHCARD MODE ── */
        <main className="flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-28 select-none overflow-x-hidden overflow-y-auto">
          {displayWords.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">{t('review.previewNoResults', 'No words match your search.')}</p>
          ) : (
            <>
              {/* Card stack */}
              <div className="relative w-full max-w-sm" style={{ height: 340 }}>

                {/* Stacked peek cards */}
                {[2, 1].map((offset) => {
                  const peekIdx = cardIndex + offset;
                  if (peekIdx >= displayWords.length) return null;
                  return (
                    <div
                      key={peekIdx}
                      className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-md"
                      style={{
                        height: 300,
                        transform: `translateY(-${offset * 10}px) scale(${1 - offset * 0.045})`,
                        transformOrigin: 'bottom center',
                        zIndex: 10 - offset,
                        opacity: 1 - offset * 0.3,
                      }}
                    />
                  );
                })}

                {/* Active card — drag wrapper */}
                <div
                  className="absolute inset-x-0 bottom-0 cursor-grab active:cursor-grabbing"
                  style={{ height: 300, zIndex: 20, touchAction: 'none', ...cardStyle() }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <div className="flashcard-scene w-full h-full">
                    <div className={`flashcard-inner w-full h-full${flipped ? ' is-flipped' : ''}`}>

                      {/* Front face */}
                      <div className="flashcard-face bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-lg flex flex-col px-8 py-6">
                        <span className="absolute top-3 left-4 text-[11px] font-mono text-gray-300 dark:text-gray-600">{originalIndex.get(currentWord.id) ?? cardIndex + 1}</span>
                        {/* Vertically centered word content */}
                        <div className="flex-1 flex flex-col items-center justify-center gap-2">
                          <p className="text-3xl font-bold text-gray-900 dark:text-white text-center leading-tight break-words">
                            {currentWord.word}
                          </p>
                          {currentWord.sentence && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 text-center italic line-clamp-2 px-2">
                              {currentWord.sentence}
                            </p>
                          )}
                        </div>
                        {/* Bottom bar: tap hint left, buttons right */}
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-gray-300 dark:text-gray-600">
                            {t('review.flashcardTap')}
                          </p>
                          <div className="flex items-center gap-2">
                            <InsightButton
                              active={flashInsightOpen}
                              label={t('llm.insight')}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); runInsight(currentWord); }}
                            />
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); pronounceWord(currentWord.word, wordLang(currentWord)); }}
                              className="p-2.5 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                              aria-label="Pronounce"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              </svg>
                            </button>
                            {/* AI Insight button on front face */}
                            {isLoggedIn && (
                              <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); setHeartWord(currentWord); }}
                                className="p-2.5 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-red-400 dark:hover:text-red-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                aria-label={t('userVocab.addToGroup')}
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Back face */}
                      <div className="flashcard-face flashcard-back-face bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 rounded-3xl border border-blue-100 dark:border-gray-600 shadow-lg flex flex-col items-center justify-center px-8 py-6 gap-2">
                        <p className="text-sm font-semibold text-gray-400 dark:text-gray-500 text-center">
                          {currentWord.word}
                        </p>
                        <div className="w-8 h-px bg-blue-200 dark:bg-gray-500 my-1" />
                        <p className="text-2xl font-bold text-gray-900 dark:text-white text-center leading-snug break-words">
                          {currentWord.translateEn}
                        </p>
                        {currentWord.translateCh && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1">
                            {currentWord.translateCh}
                          </p>
                        )}
                        {currentWord.sentence && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 text-center italic mt-3 leading-relaxed line-clamp-3 px-2">
                            {currentWord.sentence}
                          </p>
                        )}
                      </div>

                    </div>
                  </div>
                </div>
              </div>

              {/* AI insight panel for flashcard mode */}
              {flashInsightOpen && (
                <div className="w-full max-w-sm mt-4 animate-slide-down">
                  <InsightPanel
                    isLoggedIn={isLoggedIn}
                    loading={insight.loading}
                    error={insight.error}
                    text={insight.text}
                    noLoginLabel={t('llm.loginRequired')}
                    thinkingLabel={t('llm.thinking')}
                    errorLabel={t('llm.error')}
                    onRetry={() => insight.retry(String(currentWord.id), () => getWordInsight(currentWord.word || '', currentWord.translateEn || '', currentWord.translateCh || '', i18n.language, wordLang(currentWord)))}
                  />
                </div>
              )}

              {/* Progress dots — show current ± 5 */}
              <div className="flex items-center gap-1.5 mt-6 justify-center">
                {displayWords.map((_, i) => {
                  if (i < cardIndex - 5 || i > cardIndex + 5) return null;
                  return (
                    <button
                      key={i}
                      onClick={() => { if (!exitingRef.current) { setCardIndex(i); setFlipped(false); setDragX(0); clearInsight(); } }}
                      className={`rounded-full transition-all duration-200 ${
                        i === cardIndex ? 'w-5 h-2 bg-blue-500' : 'w-2 h-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                      }`}
                      aria-label={`Card ${i + 1}`}
                    />
                  );
                })}
              </div>

              {/* Prev / counter / Next */}
              <div className="flex items-center gap-4 mt-4">
                <button
                  onClick={goPrev}
                  disabled={cardIndex === 0}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-500 dark:text-gray-400 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Previous card"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm text-gray-400 dark:text-gray-500 min-w-[60px] text-center">
                  {cardIndex + 1} / {displayWords.length}
                </span>
                <button
                  onClick={goNext}
                  disabled={cardIndex >= displayWords.length - 1}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-500 dark:text-gray-400 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Next card"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </main>
      ) : (
        /* ── LIST MODE ── */
        <main className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 max-w-xl mx-auto w-full pb-8">
          {displayWords.length === 0 && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">
              {t('review.previewNoResults', 'No words match your search.')}
            </p>
          )}
          {displayWords.slice(0, visibleCount).map((word, i) => {
            const isInsightOpen = selectedWordId === word.id;
            const isRevealed = revealedIds.has(word.id);
            return (
              <div
                key={word.id ?? i}
                className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm overflow-hidden transition-all animate-fade-in-up ${
                  isInsightOpen ? 'rainbow-glow' : 'border-gray-100 dark:border-gray-700'
                }`}
                style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
              >
                {/* Word row */}
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 text-[11px] font-mono text-gray-300 dark:text-gray-600">{originalIndex.get(word.id) ?? i + 1}</span>
                      <p className="text-base font-bold text-gray-900 dark:text-white leading-snug break-words">
                        {word.word}
                      </p>
                      <button
                        onClick={() => pronounceWord(word.word, wordLang(word))}
                        className="shrink-0 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400 dark:text-gray-500"
                        aria-label="Pronounce"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                      </button>
                    </div>
                    {word.sentence && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic truncate">
                        {word.sentence}
                      </p>
                    )}
                    {/* AI Insight button */}
                    <div className="mt-1.5">
                      <InsightButton
                        active={isInsightOpen}
                        label={t('llm.insight')}
                        onClick={() => runInsight(word)}
                      />
                    </div>
                  </div>
                  {/* Right-side buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isLoggedIn && (
                      <button
                        onClick={() => setHeartWord(word)}
                        className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400"
                        aria-label={t('userVocab.addToGroup')}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => toggleReveal(word.id)}
                      className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400 dark:text-gray-500"
                      aria-label={isRevealed ? t('review.previewHide') : t('review.previewReveal')}
                    >
                      {isRevealed ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Meaning area */}
                <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2.5 min-h-[40px] flex items-center">
                  {isRevealed ? (
                    <div>
                      <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">{word.translateEn}</p>
                      {word.translateCh && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{word.translateCh}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 w-full">
                      <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 flex-1 max-w-[180px]" />
                      <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 w-16" />
                      <p className="text-xs text-gray-300 dark:text-gray-600 ml-auto">{t('review.previewTapReveal')}</p>
                    </div>
                  )}
                </div>

                {/* AI insight panel */}
                {isInsightOpen && (
                  <div className="px-4 pb-3 pt-0 animate-slide-down">
                    <InsightPanel
                      isLoggedIn={isLoggedIn}
                      loading={insight.loading}
                      error={insight.error}
                      text={insight.text}
                      noLoginLabel={t('llm.loginRequired')}
                      thinkingLabel={t('llm.thinking')}
                      errorLabel={t('llm.error')}
                      onRetry={() => insight.retry(String(word.id), () => getWordInsight(word.word || '', word.translateEn || '', word.translateCh || '', i18n.language, wordLang(word)))}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {/* Sentinel — triggers next batch when scrolled into view */}
          <div ref={sentinelRef} className="h-10 flex items-center justify-center">
            {visibleCount < displayWords.length && (
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        </main>
      )}

      {showOnboarding && (() => {
        const raw: any[] = t('onboarding.wordPreview', { returnObjects: true }) as any[];
        const steps = raw.map((s) => ({ icon: s.icon, iconBg: 'bg-blue-50 dark:bg-blue-900/20', title: s.title, body: s.body }));
        return <OnboardingModal steps={steps} onDone={dismissOnboarding} onSkip={dismissOnboarding} />;
      })()}
      {heartWord && <AddToGroupModal word={heartWord} onClose={() => setHeartWord(null)} />}

    </div>
  );
};

export default WordPreviewPage;
