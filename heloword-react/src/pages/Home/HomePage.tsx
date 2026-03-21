import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { Sentence, WORD_SENTENCE_TITLE_MAP, WordStore } from '../../models';
import { doPost } from '../../services/api.service';

// Simple word card component
const WordCard: React.FC<{ word: Sentence; onClick?: () => void }> = ({ word }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col gap-0.5 hover:shadow-md transition-shadow">
    <p className="text-sm font-semibold text-gray-800 truncate">{word.word || word.sentence}</p>
    {word.translateEn && (
      <p className="text-xs text-blue-500 truncate">{word.translateEn}</p>
    )}
    {word.translateCh && (
      <p className="text-xs text-gray-400 truncate">{word.translateCh}</p>
    )}
    {word.sentence && word.word && (
      <p className="text-xs text-gray-500 italic truncate mt-0.5">{word.sentence}</p>
    )}
  </div>
);

// Word list section
const WordSection: React.FC<{
  title: string;
  list: Sentence[];
  onViewAll: () => void;
}> = ({ title, list, onViewAll }) => {
  if (!list || list.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-gray-800">{title}</h2>
        <button
          onClick={onViewAll}
          className="text-xs text-blue-500 font-medium hover:text-blue-700"
        >
          View All ({list.length})
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {list.slice(0, 6).map((word) => (
          <WordCard key={`${word.tableName}-${word.id}`} word={word} />
        ))}
      </div>
    </section>
  );
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const { wordStore, sentenceStore, updateWordStore, updateSentenceStore, isWordStoreEmpty } = useData();
  const { showAlert, showLoading, hideLoading } = useUI();
  const hasFetched = useRef(false);
  const alertShown = useRef(false);

  useEffect(() => {
    if (hasFetched.current || !isWordStoreEmpty()) {
      if (!alertShown.current) {
        alertShown.current = true;
        const msg =
          'Currently still under construction, might be updated anytime!' +
          (!isLoggedIn ? '\nLog in for more data.' : '');
        showAlert(msg);
      }
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

      // Fill English words with matching sentence snippets
      if (isLoggedIn && d.sentenceEnglishList?.length) {
        fillWordWithSentence(words, d.sentenceEnglishList);
      }

      if (!alertShown.current) {
        alertShown.current = true;
        const msg =
          'Currently still under construction, might be updated anytime!' +
          (!isLoggedIn ? '\nLog in for more data.' : '');
        showAlert(msg);
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
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header title="Heloword" />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        {/* Hero card */}
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

        {/* Loading state */}
        {!hasData && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Loading word lists...</p>
          </div>
        )}

        {/* Word / sentence sections */}
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
