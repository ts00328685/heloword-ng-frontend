import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { Sentence, WordStore } from '../../models';
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
  const { t } = useTranslation();
  if (!list || list.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h2>
        <button
          onClick={onViewAll}
          className="text-xs text-blue-500 font-medium hover:text-blue-700 dark:hover:text-blue-300"
        >
          {t('home.viewAll')}
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

const AuthorNoteModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const paragraphs = t('authorNote.body').split('\n\n');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-safe" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        <div className="px-6 pt-4 pb-6">
          {/* Avatar + title */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <span className="text-lg">👨‍💻</span>
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{t('authorNote.title')}</h2>
            <button
              onClick={onClose}
              className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-3 mb-5 max-h-52 overflow-y-auto pr-1">
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>

          {/* Social links */}
          <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
            <a
              href="https://github.com/ts00328685"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              aria-label="GitHub"
            >
              <svg className="w-5 h-5 text-gray-700 dark:text-gray-200" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.2 22 16.447 22 12.021 22 6.484 17.522 2 12 2z" />
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/in/ryan-tseng-4161ab83/"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              aria-label="LinkedIn"
            >
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            <a
              href="mailto:ts00328685@gmail.com"
              className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
              aria-label="Email"
            >
              <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const { wordStore, sentenceStore, updateWordStore, updateSentenceStore, isWordStoreEmpty, isFullyLoaded, loadFullDashboard } = useData();
  const { dueCount } = useNotifications();
  const { showLoading, hideLoading } = useUI();
  const hasFetched = useRef(false);
  const [showAuthor, setShowAuthor] = useState(false);

  useEffect(() => {
    if (hasFetched.current || !isWordStoreEmpty()) {
      return;
    }
    hasFetched.current = true;
    fetchPreview();
  }, []);

  const fetchPreview = async () => {
    showLoading();
    try {
      const response = await doPost('/frontend-api/api/fe/home/dashboard?previewSize=4');
      const d = response.data || {};

      const words: WordStore = {
        wordEnglishList: d.wordEnglishList || [],
        wordGermanList: d.wordGermanList || [],
        wordJapaneseList: d.wordJapaneseList || [],
        wordJapaneseVerbList: d.wordJapaneseVerbList || [],
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

  const handleViewAll = async (key: string, list: Sentence[]) => {
    if (isFullyLoaded) {
      const allData: Record<string, Sentence[]> = { ...wordStore, ...sentenceStore } as any;
      navigate('/vocabulary/list', { state: { wordListOriginal: allData[key] ?? list } });
      return;
    }
    showLoading();
    try {
      const { words, sentences } = await loadFullDashboard();
      const allData: Record<string, Sentence[]> = { ...words, ...sentences } as any;
      navigate('/vocabulary/list', { state: { wordListOriginal: allData[key] ?? list } });
    } catch {
      navigate('/vocabulary/list', { state: { wordListOriginal: list } });
    } finally {
      hideLoading();
    }
  };

  const allSections = [
    { key: 'wordEnglishList', list: wordStore.wordEnglishList },
    { key: 'wordGermanList', list: wordStore.wordGermanList },
    { key: 'wordJapaneseList', list: wordStore.wordJapaneseList },
    { key: 'wordJapaneseVerbList', list: wordStore.wordJapaneseVerbList },
    { key: 'sentenceEnglishList', list: sentenceStore.sentenceEnglishList },
    { key: 'sentenceGermanList', list: sentenceStore.sentenceGermanList },
    { key: 'sentenceJapaneseList', list: sentenceStore.sentenceJapaneseList },
  ];

  const hasData = allSections.some((s) => s.list?.length > 0);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Heloword" />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        <div className="relative bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl p-5 mb-6 text-white shadow-lg">
          <button
            onClick={() => setShowAuthor(true)}
            className="absolute top-3 right-3 bg-white text-blue-600 text-xs font-bold px-3 py-1.5 rounded-xl shadow-md hover:bg-blue-50 hover:shadow-lg active:scale-95 transition-all duration-150"
          >
            {t('authorNote.buttonLabel')}
          </button>
          <h2 className="text-xl font-bold mb-1 pr-28">{t('home.quizTitle')}</h2>
          <p className="text-blue-100 text-sm mb-4">{t('home.quizSubtitle')}</p>
          <button
            onClick={() => navigate('/vocabulary')}
            className="bg-white text-blue-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-blue-50 transition-colors shadow"
          >
            {t('home.goToQuiz')}
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
                {t('home.dueWords', { count: dueCount })}
              </p>
              <p className="text-xs text-orange-500 dark:text-orange-500 mt-0.5">{t('home.dueCurve')}</p>
            </div>
            <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}

        {!hasData && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">{t('home.loading')}</p>
          </div>
        )}

        {allSections.map(({ key, list }) => (
          <WordSection
            key={key}
            title={t(`wordLists.${key}`, key)}
            list={list}
            onViewAll={() => handleViewAll(key, list)}
          />
        ))}
      </main>

      {showAuthor && <AuthorNoteModal onClose={() => setShowAuthor(false)} />}
    </div>
  );
};

export default HomePage;
