import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../contexts/UIContext';
import { useAiInsight } from '../../hooks/useAiInsight';
import { pronounceWord } from '../../services/tts.service';
import { getWordInsight } from '../../services/llm.service';
import {
  SharedVocabGroup,
  CustomWord,
  fetchSharedGroupWords,
  copySharedGroup,
} from '../../services/customVocab.service';
import { Sentence } from '../../models';

const SharedVocabGroupPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { shareId } = useParams<{ shareId: string }>();
  const location = useLocation();
  const { isLoggedIn } = useAuth();
  const { showAlert } = useUI();

  const id = Number(shareId);
  const group: SharedVocabGroup | undefined = location.state?.group;

  const [words, setWords] = useState<CustomWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [hideMeanings, setHideMeanings] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [copying, setCopying] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);

  // AI insight
  const [selectedWordId, setSelectedWordId] = useState<number | null>(null);
  const insight = useAiInsight('shared-vocab:insight');

  // Flashcard mode
  const [flashMode, setFlashMode] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const [exitDir, setExitDir] = useState<'left' | 'right' | null>(null);
  const [enterDir, setEnterDir] = useState<'left' | 'right' | null>(null);
  const exitingRef = useRef(false);

  const toggleReveal = (wordId: number) =>
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.has(wordId) ? next.delete(wordId) : next.add(wordId);
      return next;
    });
  const isMeaningVisible = (wordId: number) => !hideMeanings || revealedIds.has(wordId);

  useEffect(() => {
    setLoading(true);
    fetchSharedGroupWords(id)
      .then(setWords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const wordLang = group?.language === 'JA' ? 'jp' : 'en';

  const filtered = query.trim()
    ? words.filter(
        (w) =>
          w.word.toLowerCase().includes(query.toLowerCase()) ||
          w.translateEn.toLowerCase().includes(query.toLowerCase()) ||
          (w.translateCh || '').includes(query),
      )
    : words;

  // ── AI insight ────────────────────────────────────────────────────────────────

  const clearInsight = () => { setSelectedWordId(null); insight.clear(); };

  const handleWordTap = (word: CustomWord) => {
    if (selectedWordId === word.id) { clearInsight(); return; }
    setSelectedWordId(word.id);
    if (!isLoggedIn) return;
    insight.run(
      String(word.id),
      () => getWordInsight(word.word, word.translateEn, word.translateCh || '', i18n.language, wordLang),
    );
  };

  // ── Flashcard helpers ─────────────────────────────────────────────────────────

  const flashGoNext = (list: CustomWord[]) => {
    if (exitingRef.current || cardIndex >= list.length - 1) return;
    exitingRef.current = true;
    clearInsight();
    setExitDir('left');
    setTimeout(() => {
      setCardIndex((i) => i + 1); setFlipped(false); setDragX(0); setExitDir(null);
      setEnterDir('right');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setEnterDir(null);
        setTimeout(() => { exitingRef.current = false; }, 320);
      }));
    }, 280);
  };

  const flashGoPrev = () => {
    if (exitingRef.current || cardIndex <= 0) return;
    exitingRef.current = true;
    clearInsight();
    setExitDir('right');
    setTimeout(() => {
      setCardIndex((i) => i - 1); setFlipped(false); setDragX(0); setExitDir(null);
      setEnterDir('left');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setEnterDir(null);
        setTimeout(() => { exitingRef.current = false; }, 320);
      }));
    }, 280);
  };

  const flashPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (exitingRef.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartX.current = e.clientX;
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const flashPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartX.current;
    dragXRef.current = dx;
    setDragX(dx);
  };

  const flashPointerUp = (list: CustomWord[]) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    const dist = dragXRef.current;
    dragXRef.current = 0;
    if (Math.abs(dist) < 10) { setFlipped((f) => !f); setDragX(0); }
    else if (dist < -60) flashGoNext(list);
    else if (dist > 60) flashGoPrev();
    else setDragX(0);
  };

  const flashCardStyle = (): React.CSSProperties => {
    if (exitDir === 'left')   return { transform: 'translateX(-130vw) rotate(-12deg)', transition: 'transform 0.28s ease-in, opacity 0.28s ease-in', opacity: 0 };
    if (exitDir === 'right')  return { transform: 'translateX(130vw) rotate(12deg)',   transition: 'transform 0.28s ease-in, opacity 0.28s ease-in', opacity: 0 };
    if (enterDir === 'right') return { transform: 'translateX(130vw)',  transition: 'none', opacity: 0 };
    if (enterDir === 'left')  return { transform: 'translateX(-130vw)', transition: 'none', opacity: 0 };
    if (isDragging)           return { transform: `translateX(${dragX}px) rotate(${dragX * 0.025}deg)`, transition: 'none' };
    return { transform: 'translateX(0) rotate(0deg)', transition: 'transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.32s ease', opacity: 1 };
  };

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleCopy = async () => {
    if (!isLoggedIn) { showAlert(t('llm.loginRequired')); return; }
    setCopying(true);
    try {
      await copySharedGroup(id);
      showAlert(t('sharedVocab.copySuccess'));
    } catch {
      showAlert(t('sharedVocab.copyError'));
    } finally {
      setCopying(false);
    }
  };

  const handleStartQuiz = async () => {
    if (!isLoggedIn) { showAlert(t('llm.loginRequired')); return; }
    if (words.length === 0) return;
    setQuizLoading(true);
    try {
      const quizType = `sharedVocabGroup:${id}`;
      const preloadedWords: Sentence[] = words.map((w) => ({
        id: w.id,
        word: w.word,
        sentence: w.sentence || '',
        translateEn: w.translateEn,
        translateCh: w.translateCh || '',
        tableName: 'USER_CUSTOM_WORD',
        language: (group?.language === 'JA' ? 'jp' : 'en') as any,
        status: 1,
        _quizType: quizType,
      }));
      const quizSetting = {
        type: quizType,
        tableName: 'USER_CUSTOM_WORD',
        total: words.length,
        min: 1,
        max: words.length,
        isSelected: true,
        timestamp: new Date(),
      };
      navigate('/vocabulary/quiz', {
        state: { quizSettings: { [quizType]: quizSetting }, preloadedWords },
      });
    } finally {
      setQuizLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={group?.name ?? ''} showBack />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-4 pb-24">
        {/* Group info */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded font-medium">
              {group?.language ?? '—'}
            </span>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {t('userVocab.wordCount', { count: group?.wordCount ?? words.length })}
            </span>
            <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500 italic bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
              {t('sharedVocab.readOnly', 'Read-only')}
            </span>
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-snug">{group?.name ?? '…'}</h1>
          {group?.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{group.description}</p>
          )}
          <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
            {t('sharedVocab.sharedBy', { name: group?.sharerDisplayName ?? '…' })}
          </p>
          {group?.tags && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {group.tags.split(',').map((s) => s.trim()).filter(Boolean).map((tag) => (
                <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={handleStartQuiz}
            disabled={quizLoading || words.length === 0}
            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-bold py-3 rounded-2xl shadow-sm transition-colors text-sm"
          >
            {quizLoading ? '…' : t('sharedVocab.startQuiz')}
          </button>
          <button
            onClick={handleCopy}
            disabled={copying}
            className="flex-1 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 text-gray-700 dark:text-gray-200 font-semibold py-3 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm transition-colors text-sm"
          >
            {copying ? t('sharedVocab.copying') : t('sharedVocab.copyGroup')}
          </button>
        </div>

        {/* Search + hide meanings toggle */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('userVocab.searchGroups', 'Search…')}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : words.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">
            {t('userVocab.emptyWords')}
          </p>
        ) : (
          <div className="space-y-2">
            {/* View controls row */}
            <div className="flex justify-between items-center mb-1">
              {/* Flashcard toggle */}
              <button
                onClick={() => { setFlashMode((m) => !m); setCardIndex(0); setFlipped(false); setDragX(0); clearInsight(); }}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
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

              {/* Hide/show meanings */}
              <button
                onClick={() => { setHideMeanings((v) => !v); setRevealedIds(new Set()); }}
                className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                  hideMeanings
                    ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {hideMeanings ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
                {hideMeanings ? t('wordList.showMeanings', 'Show meanings') : t('wordList.hideMeanings', 'Hide meanings')}
              </button>
            </div>

            {/* ── Flashcard mode ─────────────────────────────────────────────── */}
            {flashMode ? (() => {
              const flashInsightOpen = selectedWordId === filtered[cardIndex]?.id;
              const cur = filtered[cardIndex];
              if (!cur) return null;
              return (
                <div className="flex flex-col items-center pt-4 pb-28 select-none overflow-x-hidden">
                  {/* Card stack */}
                  <div className="relative w-full max-w-sm" style={{ height: 340 }}>
                    {[2, 1].map((offset) => {
                      if (cardIndex + offset >= filtered.length) return null;
                      return (
                        <div key={offset}
                          className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-md"
                          style={{ height: 300, transform: `translateY(-${offset * 10}px) scale(${1 - offset * 0.045})`, transformOrigin: 'bottom center', zIndex: 10 - offset, opacity: 1 - offset * 0.3 }}
                        />
                      );
                    })}
                    {/* Active card */}
                    <div
                      className="absolute inset-x-0 bottom-0 cursor-grab active:cursor-grabbing"
                      style={{ height: 300, zIndex: 20, touchAction: 'none', ...flashCardStyle() }}
                      onPointerDown={flashPointerDown}
                      onPointerMove={flashPointerMove}
                      onPointerUp={() => flashPointerUp(filtered)}
                      onPointerCancel={() => flashPointerUp(filtered)}
                    >
                      <div className="flashcard-scene w-full h-full">
                        <div className={`flashcard-inner w-full h-full${flipped ? ' is-flipped' : ''}`}>
                          {/* Front */}
                          <div className="flashcard-face bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-lg flex flex-col px-8 py-6">
                            <span className="absolute top-3 left-4 text-[11px] font-mono text-gray-300 dark:text-gray-600">{cardIndex + 1}</span>
                            <div className="flex-1 flex flex-col items-center justify-center gap-2">
                              <p className="text-3xl font-bold text-gray-900 dark:text-white text-center leading-tight break-words">{cur.word}</p>
                              {cur.phonetics && <p className="text-sm text-gray-400 dark:text-gray-500 text-center">{cur.phonetics}</p>}
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] text-gray-300 dark:text-gray-600">{t('review.flashcardTap')}</p>
                              <div className="flex items-center gap-2">
                                <button
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); pronounceWord(cur.word, wordLang); }}
                                  className="p-2.5 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                  aria-label="Pronounce"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                  </svg>
                                </button>
                                <button
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); handleWordTap(cur); }}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide transition-all duration-150 ${
                                    flashInsightOpen
                                      ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 ring-1 ring-gray-800 dark:ring-gray-100'
                                      : 'text-gray-400 dark:text-gray-500 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-gray-400 dark:hover:ring-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                                  }`}
                                >
                                  <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 10 10" fill="currentColor"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
                                  {flashInsightOpen ? `${t('llm.insight')} ▲` : t('llm.insight')}
                                </button>
                              </div>
                            </div>
                          </div>
                          {/* Back */}
                          <div className="flashcard-face flashcard-back-face bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 rounded-3xl border border-blue-100 dark:border-gray-600 shadow-lg flex flex-col items-center justify-center px-8 py-6 gap-2">
                            <p className="text-sm font-semibold text-gray-400 dark:text-gray-500 text-center">{cur.word}</p>
                            <div className="w-8 h-px bg-blue-200 dark:bg-gray-500 my-1" />
                            <p className="text-2xl font-bold text-gray-900 dark:text-white text-center leading-snug break-words">{cur.translateEn}</p>
                            {cur.translateCh && <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1">{cur.translateCh}</p>}
                            {cur.sentence && <p className="text-xs text-gray-400 dark:text-gray-500 text-center italic mt-3 leading-relaxed line-clamp-3 px-2">{cur.sentence}</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI insight panel */}
                  {flashInsightOpen && (
                    <div className="w-full max-w-sm mt-4 animate-fade-in">
                      <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-3 ring-1 ring-inset ring-gray-100 dark:ring-gray-700">
                        {!isLoggedIn ? (
                          <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t('llm.loginRequired')}</p>
                        ) : insight.loading ? (
                          <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">{t('llm.thinking')}</p>
                        ) : insight.error ? (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-red-400">{t('llm.error')}</p>
                            <button onClick={() => insight.retry(String(cur.id), () => getWordInsight(cur.word, cur.translateEn, cur.translateCh || '', i18n.language, wordLang))} className="text-xs text-blue-400 underline">↺</button>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{insight.text}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Progress dots */}
                  <div className="flex items-center gap-1.5 mt-6 justify-center">
                    {filtered.map((_, i) => {
                      if (i < cardIndex - 5 || i > cardIndex + 5) return null;
                      return (
                        <button key={i}
                          onClick={() => { if (!exitingRef.current) { setCardIndex(i); setFlipped(false); setDragX(0); clearInsight(); } }}
                          className={`rounded-full transition-all duration-200 ${i === cardIndex ? 'w-5 h-2 bg-blue-500' : 'w-2 h-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'}`}
                          aria-label={`Card ${i + 1}`}
                        />
                      );
                    })}
                  </div>

                  {/* Prev / counter / Next */}
                  <div className="flex items-center gap-4 mt-4">
                    <button
                      onClick={() => flashGoPrev()}
                      disabled={cardIndex === 0}
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-500 dark:text-gray-400 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      aria-label="Previous card"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-sm text-gray-400 dark:text-gray-500 min-w-[60px] text-center">
                      {cardIndex + 1} / {filtered.length}
                    </span>
                    <button
                      onClick={() => flashGoNext(filtered)}
                      disabled={cardIndex >= filtered.length - 1}
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-500 dark:text-gray-400 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      aria-label="Next card"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })() : (
              /* ── List mode ─────────────────────────────────────────────────── */
              filtered.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">
                  {t('userVocab.noResults')}
                </p>
              ) : (
                filtered.map((word, idx) => {
                  const isSelected = selectedWordId === word.id;
                  const wordNo = words.indexOf(word) + 1;
                  return (
                    <div
                      key={word.id}
                      className={`bg-white dark:bg-gray-800 rounded-xl border shadow-sm transition-all animate-fade-in-up ${
                        isSelected
                          ? 'rainbow-glow'
                          : 'border-gray-200 dark:border-gray-700 hover:shadow-md'
                      }`}
                      style={{ animationDelay: `${Math.min(idx, 10) * 40}ms` }}
                    >
                      <div className="p-3 flex gap-3 items-start">
                        <span className="shrink-0 text-[11px] font-mono text-gray-300 dark:text-gray-600 pt-0.5 w-7 text-right">{wordNo}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{word.word}</p>
                            <button
                              onClick={() => pronounceWord(word.word, wordLang)}
                              className="shrink-0 p-0.5 rounded text-gray-300 dark:text-gray-600 hover:text-blue-400 dark:hover:text-blue-400 transition-colors"
                              aria-label="Pronounce"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              </svg>
                            </button>
                          </div>
                          {isMeaningVisible(word.id) ? (
                            <>
                              {word.translateEn && <p className="text-xs text-blue-500 mt-0.5">{word.translateEn}</p>}
                              {word.translateCh && <p className="text-xs text-gray-400 dark:text-gray-500">{word.translateCh}</p>}
                              {word.sentence && <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1 leading-relaxed line-clamp-2">{word.sentence}</p>}
                            </>
                          ) : (
                            <div className="flex items-center gap-2 mt-1">
                              <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 w-24" />
                              <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 w-16" />
                            </div>
                          )}
                          {/* AI Insight button */}
                          <button
                            onClick={() => handleWordTap(word)}
                            className={`mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide transition-all duration-150 ${
                              isSelected
                                ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 ring-1 ring-gray-800 dark:ring-gray-100'
                                : 'text-gray-400 dark:text-gray-500 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-gray-400 dark:hover:ring-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                          >
                            <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
                            {isSelected ? `${t('llm.insight')} ▲` : t('llm.insight')}
                          </button>
                        </div>
                        {hideMeanings && (
                          <button
                            onClick={() => toggleReveal(word.id)}
                            className="p-1.5 rounded-xl transition-colors text-gray-300 dark:text-gray-600 hover:text-indigo-400 dark:hover:text-indigo-400 shrink-0"
                            aria-label={isMeaningVisible(word.id) ? 'Hide' : 'Reveal'}
                          >
                            {isMeaningVisible(word.id) ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>

                      {/* AI insight panel */}
                      {isSelected && (
                        <div className="px-3 pb-3 pt-0 animate-slide-down">
                          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 ring-1 ring-inset ring-gray-100 dark:ring-gray-700">
                            {!isLoggedIn ? (
                              <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t('llm.loginRequired')}</p>
                            ) : insight.loading ? (
                              <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">{t('llm.thinking')}</p>
                            ) : insight.error ? (
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-red-400">{t('llm.error')}</p>
                                <button
                                  onClick={() => insight.retry(String(word.id), () => getWordInsight(word.word, word.translateEn, word.translateCh || '', i18n.language, wordLang))}
                                  className="text-xs text-blue-400 underline"
                                >↺</button>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{insight.text}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default SharedVocabGroupPage;
