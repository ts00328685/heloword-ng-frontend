import React, { useEffect, useMemo, useRef, useState } from 'react'; // useRef kept for sentinelRef
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import QuizSettingModal from '../../components/QuizSettingModal';
import SentenceRenderer from '../../components/SentenceRenderer';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Sentence } from '../../models';
import { getWordInsight } from '../../services/llm.service';
import { useAiInsight } from '../../hooks/useAiInsight';

const PAGE_SIZE = 50;

interface FilterButton {
  label: string;
  min: number; // 1-based index inclusive
  max: number; // 1-based index inclusive
}

function buildFilterButtons(listType: string | undefined, total: number): FilterButton[] {
  if (!listType || total === 0) return [];

  if (listType === 'wordEnglishList') {
    return [
      { label: 'Easy', min: 1, max: 2000 },
      { label: 'Medium', min: 2001, max: 4000 },
      { label: 'Intermediary', min: 4001, max: 6421 },
      { label: 'Advanced', min: 6422, max: 9481 },
    ].filter((b) => b.min <= total);
  }

  if (listType === 'wordJapaneseList') {
    const size = Math.ceil(total / 5);
    const labels = ['N5', 'N4', 'N3', 'N2', 'N1'];
    return labels.map((label, i) => ({
      label,
      min: i * size + 1,
      max: Math.min((i + 1) * size, total),
    }));
  }

  if (listType === 'wordJapaneseVerbList') {
    const buttons: FilterButton[] = [];
    for (let start = 1; start <= total; start += 300) {
      const end = Math.min(start + 299, total);
      buttons.push({ label: `${start}–${end}`, min: start, max: end });
    }
    return buttons;
  }

  return [];
}

const VocabularyListPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { wordStore } = useData();
  const { isLoggedIn } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterButton | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // AI insight state
  const [selectedWordId, setSelectedWordId] = useState<number | null>(null);
  const insight = useAiInsight('vocab:insight');

  const handleWordTap = (word: Sentence) => {
    if (selectedWordId === word.id) {
      setSelectedWordId(null);
      insight.clear();
      return;
    }
    setSelectedWordId(word.id);
    if (!isLoggedIn) return; // guest — panel shows login prompt, no fetch
    insight.run(
      String(word.id),
      () => getWordInsight(
        word.word || word.sentence || '',
        word.translateEn || '',
        word.translateCh || '',
        i18n.language,
        word.language || 'en',
      ),
    );
  };

  const list: Sentence[] =
    location.state?.wordListOriginal ||
    wordStore.wordEnglishList ||
    [];

  const listType: string | undefined = location.state?.listType;

  const filterButtons = useMemo(
    () => buildFilterButtons(listType, list.length),
    [listType, list.length]
  );

  const filtered = useMemo(() => {
    let base = list;

    if (activeFilter) {
      // activeFilter.min/max are 1-based inclusive
      base = list.slice(activeFilter.min - 1, activeFilter.max);
    }

    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((w) =>
      (w.word || '').toLowerCase().includes(q) ||
      (w.sentence || '').toLowerCase().includes(q) ||
      (w.translateEn || '').toLowerCase().includes(q) ||
      (w.translateCh || '').toLowerCase().includes(q)
    );
  }, [list, query, activeFilter]);

  // Reset visible count whenever the filtered set changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filtered]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length]);

  if (list.length === 0) {
    navigate('/home', { replace: true });
    return null;
  }

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header
        title={t('wordList.title')}
        showBack
        rightContent={
          <button
            onClick={() => setShowModal(true)}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Start quiz"
          >
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        }
      />

      <main className="flex-1 pb-24 px-4 pt-4 max-w-2xl mx-auto w-full">
        {/* Search */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('review.searchPlaceholder')}
            className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter pills */}
        {filterButtons.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
            <button
              onClick={() => setActiveFilter(null)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeFilter === null
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'
              }`}
            >
              All
            </button>
            {filterButtons.map((btn) => (
              <button
                key={btn.label}
                onClick={() => setActiveFilter(activeFilter?.label === btn.label ? null : btn)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  activeFilter?.label === btn.label
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          {query || activeFilter
            ? t('wordList.itemCount', { count: filtered.length })
            : t('wordList.itemCount', { count: list.length })}
        </p>

        <div className="space-y-2">
          {visible.map((word, index) => {
            const isSelected = selectedWordId === word.id;
            return (
            <div
              key={`${word.tableName}-${word.id}`}
              className={`bg-white dark:bg-gray-800 rounded-xl border transition-all ${
                isSelected
                  ? 'border-purple-300 dark:border-purple-700 shadow-sm'
                  : 'border-gray-200 dark:border-gray-700 hover:shadow-sm'
              }`}
            >
              {/* Main row */}
              <div className="p-3 flex gap-3 items-start">
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono pt-0.5 min-w-[24px]">
                  {activeFilter ? activeFilter.min + index : index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    <SentenceRenderer text={word.word || word.sentence} />
                  </p>
                  {word.translateEn && (
                    <p className="text-xs text-blue-500 mt-0.5">{word.translateEn}</p>
                  )}
                  {word.translateCh && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">{word.translateCh}</p>
                  )}
                  {word.sentence && word.word && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1 leading-relaxed">
                      <SentenceRenderer text={word.sentence} />
                    </p>
                  )}
                  {/* AI button — always visible */}
                  <button
                    onClick={() => handleWordTap(word)}
                    className={`mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                      isSelected
                        ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-600 dark:hover:text-purple-400'
                    }`}
                  >
                    ✨ {isSelected ? t('llm.insight') + ' ▲' : t('llm.insight')}
                  </button>
                </div>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-md font-mono flex-shrink-0 mt-0.5">
                  {word.language?.toUpperCase()}
                </span>
              </div>

              {/* AI insight panel — shown when tapped */}
              {isSelected && (
                <div className="px-3 pb-3 pt-0">
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3">
                    {!isLoggedIn ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t('llm.loginRequired')}</p>
                    ) : insight.loading ? (
                      <p className="text-xs text-purple-500 animate-pulse">{t('llm.thinking')}</p>
                    ) : insight.error ? (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-red-400">{t('llm.error')}</p>
                        <button
                          onClick={() => insight.retry(String(word.id), () => getWordInsight(word.word || word.sentence || '', word.translateEn || '', word.translateCh || '', i18n.language, word.language || 'en'))}
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

          {(query || activeFilter) && filtered.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">
              {t('review.noResults')}
            </p>
          )}
        </div>

        {/* Sentinel — triggers next page load when scrolled into view */}
        <div ref={sentinelRef} className="h-10 flex items-center justify-center mt-2">
          {hasMore && (
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </main>

      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-20 right-4 z-30 w-14 h-14 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 rounded-full shadow-lg flex items-center justify-center transition-colors"
        aria-label="Open quiz settings"
      >
        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {showModal && <QuizSettingModal onClose={() => setShowModal(false)} />}
    </div>
  );
};

export default VocabularyListPage;
