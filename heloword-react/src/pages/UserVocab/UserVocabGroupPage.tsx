import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import UserVocabWordFormModal from '../../components/UserVocabWordFormModal';
import CreateGroupModal from '../../components/CreateGroupModal';
import ShareVocabGroupModal from '../../components/ShareVocabGroupModal';
import OnboardingModal from '../../components/OnboardingModal';
import ImportVocabModal from '../../components/ImportVocabModal';
import { pronounceWord } from '../../services/tts.service';
import { getWordInsight } from '../../services/llm.service';
import { useAiInsight } from '../../hooks/useAiInsight';
import { useAuth } from '../../contexts/AuthContext';
import {
  CustomGroup,
  CustomWord,
  fetchCustomWords,
  addCustomWord,
  updateCustomWord,
  deleteCustomWord,
  updateCustomGroup,
} from '../../services/customVocab.service';
import { Sentence } from '../../models';
import { useData } from '../../contexts/DataContext';

const UserVocabGroupPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId: string }>();
  const location = useLocation();
  const { wordStore } = useData();

  const [group, setGroup] = useState<CustomGroup>(location.state?.group ?? { id: Number(groupId), name: '', description: '', language: '', wordCount: 0, createDate: '' });
  const [words, setWords] = useState<CustomWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // AI insight
  const { isLoggedIn } = useAuth();
  const [selectedWordId, setSelectedWordId] = useState<number | null>(null);
  const insight = useAiInsight('custom-vocab:insight');

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
  const [editingWord, setEditingWord] = useState<CustomWord | null>(null);
  const [editingGroup, setEditingGroup] = useState(false);
  const [confirmDeleteWord, setConfirmDeleteWord] = useState<CustomWord | null>(null);
  const [deletingWord, setDeletingWord] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [hideMeanings, setHideMeanings] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const toggleReveal = (id: number) => setRevealedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const isMeaningVisible = (id: number) => !hideMeanings || revealedIds.has(id);

  const GROUP_SHARE_ONBOARDING_KEY = 'onboarding:group_share';
  const [showShareOnboarding, setShowShareOnboarding] = useState(
    () => !localStorage.getItem(GROUP_SHARE_ONBOARDING_KEY)
  );

  const id = Number(groupId);

  // Flatten all system words for the "Fill from system word" search
  const systemWords: Sentence[] = [
    ...(wordStore.wordEnglishList ?? []),
    ...(wordStore.wordGermanList ?? []),
    ...(wordStore.wordJapaneseList ?? []),
    ...(wordStore.wordJapaneseVerbList ?? []),
  ];

  useEffect(() => {
    loadWords();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadWords = async () => {
    setLoading(true);
    try {
      const data = await fetchCustomWords(id);
      setWords(data);
    } finally {
      setLoading(false);
    }
  };

  const wordLang = group.language === 'JA' ? 'jp' : 'en';

  const handleWordTap = (word: CustomWord) => {
    if (selectedWordId === word.id) {
      setSelectedWordId(null);
      insight.clear();
      return;
    }
    setSelectedWordId(word.id);
    if (!isLoggedIn) return;
    insight.run(
      String(word.id),
      () => getWordInsight(word.word, word.translateEn, word.translateCh || '', i18n.language, wordLang),
    );
  };

  // ── Flashcard helpers ────────────────────────────────────────────────────────

  const clearInsight = () => { setSelectedWordId(null); insight.clear(); };

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

  const handleAddWord = async (data: any) => {
    const created = await addCustomWord(id, data);
    setWords((prev) => [...prev, created]);
    setGroup((g) => ({ ...g, wordCount: g.wordCount + 1 }));
  };

  const handleImport = async (rows: Omit<import('../../services/customVocab.service').CustomWord, 'id' | 'groupId' | 'tableName' | 'language'>[]) => {
    const results = await Promise.all(rows.map((row) => addCustomWord(id, row)));
    setWords((prev) => [...prev, ...results]);
    setGroup((g) => ({ ...g, wordCount: g.wordCount + results.length }));
  };

  const handleUpdateWord = async (data: any) => {
    if (!editingWord) return;
    const updated = await updateCustomWord(editingWord.id, data);
    setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  };

  const handleDeleteWord = async () => {
    if (!confirmDeleteWord) return;
    setDeletingWord(true);
    try {
      await deleteCustomWord(confirmDeleteWord.id);
      setWords((prev) => prev.filter((w) => w.id !== confirmDeleteWord.id));
      setGroup((g) => ({ ...g, wordCount: Math.max(0, g.wordCount - 1) }));
      setConfirmDeleteWord(null);
    } finally {
      setDeletingWord(false);
    }
  };

  const handleUpdateGroup = async (name: string, description: string, language: string) => {
    const updated = await updateCustomGroup(id, name, description, language);
    setGroup(updated);
  };

  const handleStartQuiz = async () => {
    setQuizLoading(true);
    try {
      const freshWords = words.length > 0 ? words : await fetchCustomWords(id);
      if (freshWords.length === 0) return;

      const quizType = `userCustomGroup:${id}`;
      // Tag each word with the quiz type for settingIdMapRef lookup in VocabularyQuizPage
      const preloadedWords: Sentence[] = freshWords.map((w) => ({
        id: w.id,
        word: w.word,
        sentence: w.sentence || '',
        translateEn: w.translateEn,
        translateCh: w.translateCh || '',
        tableName: 'USER_CUSTOM_WORD',
        language: (group.language === 'JA' ? 'jp' : 'en') as any,
        status: 1,
        _quizType: quizType,
      }));

      const quizSetting = {
        type: quizType,
        tableName: 'USER_CUSTOM_WORD',
        total: freshWords.length,
        min: 1,
        max: freshWords.length,
        isSelected: true,
        timestamp: new Date(),
      };

      navigate('/vocabulary/quiz', {
        state: {
          quizSettings: { [quizType]: quizSetting },
          preloadedWords,
        },
      });
    } finally {
      setQuizLoading(false);
    }
  };

  const filtered = query.trim()
    ? words.filter((w) =>
        w.word.toLowerCase().includes(query.toLowerCase()) ||
        (w.translateEn || '').toLowerCase().includes(query.toLowerCase())
      )
    : words;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header
        title={group.name || t('userVocab.title')}
        showBack
        rightContent={
          <button
            onClick={() => setShowAddModal(true)}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t('userVocab.addWord')}
          >
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        }
      />

      <main className="flex-1 pb-44 px-4 pt-4 max-w-2xl mx-auto w-full">
        {/* Group info bar */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md font-medium">
            {group.language}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {t('userVocab.wordCount', { count: words.length })}
          </span>
          {group.description && (
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1">· {group.description}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setShowShareModal(true)}
              className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={t('vocabShare.shareTitle', 'Share with friend')}
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
            <button
              onClick={() => setEditingGroup(true)}
              className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search + actions row */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('review.searchPlaceholder')}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Desktop action buttons — inline with search bar */}
          <div className="hidden sm:flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden divide-x divide-gray-200 dark:divide-gray-700 shrink-0 shadow-sm">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4-4m0 0l4 4m-4-4v12" />
              </svg>
              {t('userVocab.importTitle')}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('userVocab.addWord')}
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && words.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center gap-4">
            <p className="text-sm text-gray-400 dark:text-gray-500">{t('userVocab.emptyWords', 'No words yet. Add your first word!')}</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {t('userVocab.addWord')}
            </button>
          </div>
        )}

        {!loading && words.length > 0 && (
          <div className="space-y-2">
            {/* View controls: flashcard toggle + hide/show meanings */}
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
                          <div className="flashcard-face bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-lg flex flex-col items-center justify-center px-8 py-6 gap-2">
                            <span className="absolute top-3 left-4 text-[11px] font-mono text-gray-300 dark:text-gray-600">{cardIndex + 1}</span>
                            <p className="text-3xl font-bold text-gray-900 dark:text-white text-center leading-tight break-words">{cur.word}</p>
                            {cur.phonetics && <p className="text-sm text-gray-400 dark:text-gray-500 text-center">{cur.phonetics}</p>}
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); pronounceWord(cur.word, wordLang); }}
                              className="mt-3 p-2.5 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                              aria-label="Pronounce"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              </svg>
                            </button>
                            {/* AI insight button */}
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
                            <p className="text-[11px] text-gray-300 dark:text-gray-600 mt-auto">{t('review.flashcardTap')}</p>
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

                  {/* Progress dots — show current ± 5 */}
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
            })() : filtered.map((word, idx) => {
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
                  {/* Main row */}
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
                    <div className="flex items-center gap-1 shrink-0">
                      {hideMeanings && (
                        <button
                          onClick={() => toggleReveal(word.id)}
                          className="p-1.5 rounded-xl transition-colors text-gray-300 dark:text-gray-600 hover:text-indigo-400 dark:hover:text-indigo-400"
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
                      <button
                        onClick={() => setEditingWord(word)}
                        className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteWord(word)}
                        className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
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
                          <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                            {insight.text}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Mobile FABs — hidden in flashcard mode */}
        {!loading && !flashMode && (
          <div className="sm:hidden fixed bottom-36 right-4 flex flex-col items-end gap-2 z-30">
            <button
              onClick={() => setShowImportModal(true)}
              className="w-12 h-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-2xl shadow-md flex items-center justify-center transition-colors"
              aria-label={t('userVocab.importTitle')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4-4m0 0l4 4m-4-4v12" />
              </svg>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="w-12 h-12 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-2xl shadow-lg flex items-center justify-center transition-colors"
              aria-label={t('userVocab.addWord')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        )}
      </main>

      {/* Start Quiz button — hidden in flashcard mode */}
      {!loading && words.length > 0 && !flashMode && (
        <div className="fixed bottom-20 left-0 right-0 px-4 pb-2 z-20 max-w-2xl mx-auto">
          <button
            onClick={handleStartQuiz}
            disabled={quizLoading}
            className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 text-white font-bold py-3.5 rounded-2xl shadow-lg transition-colors"
          >
            {quizLoading ? '…' : t('userVocab.startQuiz')}
          </button>
        </div>
      )}

      {showImportModal && (
        <ImportVocabModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
        />
      )}

      {showAddModal && (
        <UserVocabWordFormModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddWord}
          systemWords={systemWords}
          language={group.language}
        />
      )}

      {editingWord && (
        <UserVocabWordFormModal
          initial={{
            word: editingWord.word,
            translateEn: editingWord.translateEn,
            translateCh: editingWord.translateCh,
            sentence: editingWord.sentence,
            phonetics: editingWord.phonetics,
          }}
          onClose={() => setEditingWord(null)}
          onSave={handleUpdateWord}
          systemWords={systemWords}
          language={group.language}
        />
      )}

      {showShareOnboarding && (() => {
        const raw = t('onboarding.groupShare', { returnObjects: true });
        if (!Array.isArray(raw)) return null;
        const steps = (raw as any[]).map((s: any) => ({ icon: s.icon, iconBg: 'bg-purple-50 dark:bg-purple-900/20', title: s.title, body: s.body }));
        const dismiss = () => { localStorage.setItem(GROUP_SHARE_ONBOARDING_KEY, '1'); setShowShareOnboarding(false); };
        return <OnboardingModal steps={steps} onDone={dismiss} onSkip={dismiss} />;
      })()}

      {showShareModal && group && (
        <ShareVocabGroupModal
          groupId={group.id}
          groupName={group.name}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {editingGroup && (
        <CreateGroupModal
          onClose={() => setEditingGroup(false)}
          onSave={handleUpdateGroup}
          initialName={group.name}
          initialDescription={group.description}
          initialLanguage={group.language}
        />
      )}

      {confirmDeleteWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">{t('userVocab.deleteWord', 'Delete word')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 font-semibold">{confirmDeleteWord.word}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">{t('userVocab.confirmDeleteWord', 'Are you sure you want to delete this word?')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteWord(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t('social.cancel')}
              </button>
              <button
                onClick={handleDeleteWord}
                disabled={deletingWord}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                {deletingWord ? '…' : t('review.deleteGroup')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserVocabGroupPage;
