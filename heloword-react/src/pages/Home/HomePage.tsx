import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { Sentence, WORD_SENTENCE_TITLE_MAP, WordStore } from '../../models';
import { doPost } from '../../services/api.service';
import SentenceRenderer from '../../components/SentenceRenderer';
import { useNotifications } from '../../contexts/NotificationContext';

const WordCard: React.FC<{ word: Sentence }> = ({ word }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-0.5 hover:shadow-md transition-shadow">
    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate"><SentenceRenderer text={word.word || word.sentence} /></p>
    {word.translateEn && (
      <p className="text-xs text-blue-500 truncate">{word.translateEn}</p>
    )}
    {word.translateCh && (
      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{word.translateCh}</p>
    )}
    {word.sentence && word.word && (
      <p className="text-xs text-gray-500 dark:text-gray-400 italic truncate mt-0.5"><SentenceRenderer text={word.sentence} /></p>
    )}
  </div>
);

const WordSection: React.FC<{
  title: string;
  list: Sentence[];
  onViewAll: () => void;
}> = ({ title, list, onViewAll }) => {
  if (!list || list.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h2>
        <button
          onClick={onViewAll}
          className="text-xs text-blue-500 font-medium hover:text-blue-700 dark:hover:text-blue-300"
        >
          View all →
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {list.slice(0, 4).map((word, i) => (
          <WordCard key={`${word.tableName}-${word.id}-${i}`} word={word} />
        ))}
      </div>
    </section>
  );
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const { wordStore, sentenceStore, updateWordStore, updateSentenceStore, isWordStoreEmpty } = useData();
  const { dueCount } = useNotifications();
  const { showLoading, hideLoading } = useUI();
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current || !isWordStoreEmpty()) {
      return;
    }
    hasFetched.current = true;
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    showLoading();
    try {
      const response = await doPost('/frontend-api/api/fe/home/dashboard');
      const d = response.data || {};

      const words: WordStore = {
        wordEnglishList: d.wordEnglishList || [],
        wordGermanList: d.wordGermanList || [],
        wordJapaneseList: d.wordJapaneseList || [],
      };

      updateWordStore(words);
      updateSentenceStore({
        sentenceEnglishList: d.sentenceEnglishList || [],
        sentenceGermanList: d.sentenceGermanList || [],
        sentenceJapaneseList: d.sentenceJapaneseList || [],
      });

      if (isLoggedIn && d.sentenceEnglishList?.length) {
        fillWordWithSentence(words, d.sentenceEnglishList);
      }

    } finally {
      hideLoading();
    }
  };

  const fillWordWithSentence = (words: WordStore, sentences: Sentence[]) => {
    const sentenceMap: Record<string, string> = {};
    sentences.forEach((s) => {
      if (s.word) sentenceMap[s.word] = s.sentence;
    });
    (words.wordEnglishList || []).forEach((word) => {
      if (sentenceMap[word.word]) {
        word.sentence = sentenceMap[word.word];
      }
    });
  };

  const handleViewAll = (list: Sentence[]) => {
    navigate('/vocabulary/list', { state: { wordListOriginal: list } });
  };

  const allSections = [
    { key: 'wordEnglishList', list: wordStore.wordEnglishList },
    { key: 'wordGermanList', list: wordStore.wordGermanList },
    { key: 'wordJapaneseList', list: wordStore.wordJapaneseList },
    { key: 'sentenceEnglishList', list: sentenceStore.sentenceEnglishList },
    { key: 'sentenceGermanList', list: sentenceStore.sentenceGermanList },
    { key: 'sentenceJapaneseList', list: sentenceStore.sentenceJapaneseList },
  ];

  const hasData = allSections.some((s) => s.list?.length > 0);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Heloword" />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl p-5 mb-6 text-white shadow-lg">
          <h2 className="text-xl font-bold mb-1">Vocabulary Quiz</h2>
          <p className="text-blue-100 text-sm mb-4">Practice words & sentences across multiple languages</p>
          <button
            onClick={() => navigate('/vocabulary')}
            className="bg-white text-blue-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-blue-50 transition-colors shadow"
          >
            Go to Quiz →
          </button>
        </div>

        {dueCount > 0 && (
          <div
            onClick={() => navigate('/review')}
            className="flex items-center gap-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-4 mb-5 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
          >
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/40 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                {dueCount} word{dueCount !== 1 ? 's' : ''} due for review
              </p>
              <p className="text-xs text-orange-500 dark:text-orange-500 mt-0.5">Based on your forgetting curve</p>
            </div>
            <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}

        {!hasData && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading word lists...</p>
          </div>
        )}

        {allSections.map(({ key, list }) => (
          <WordSection
            key={key}
            title={WORD_SENTENCE_TITLE_MAP[key]}
            list={list}
            onViewAll={() => handleViewAll(list)}
          />
        ))}
      </main>
    </div>
  );
};

export default HomePage;
