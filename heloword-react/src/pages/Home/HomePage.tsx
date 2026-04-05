import React, { useEffect, useRef, useState } from 'react'; // useRef kept for hasFetched
import { useNavigate, useLocation } from 'react-router-dom';
import { CustomGroup, fetchCustomGroups } from '../../services/customVocab.service';
import AddToGroupModal from '../../components/AddToGroupModal';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { Sentence, WordStore } from '../../models';
import { doPost } from '../../services/api.service';
import SentenceRenderer from '../../components/SentenceRenderer';
import { useNotifications } from '../../contexts/NotificationContext';

import { pronounceWord } from '../../services/tts.service';
import { getWordInsight } from '../../services/llm.service';
import { useAiInsight } from '../../hooks/useAiInsight';
import OnboardingModal from '../../components/OnboardingModal';

const VOCAB_ONBOARDING_KEY = 'onboarding:my_vocab';

const WordSection: React.FC<{
  title: string;
  list: Sentence[];
  onViewAll: () => void;
  isLoggedIn: boolean;
  lang: string;
  onLoginRequired: () => void;
  onHeartWord?: (word: Sentence) => void;
}> = ({ title, list, onViewAll, isLoggedIn, lang, onLoginRequired, onHeartWord }) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const insight = useAiInsight('home:insight');
  const [hideMeanings, setHideMeanings] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const toggleReveal = (id: number) => setRevealedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const isMeaningVisible = (id: number) => !hideMeanings || revealedIds.has(id);

  if (!list || list.length === 0) return null;

  const handleInsight = (word: Sentence) => {
    if (selectedId === word.id) {
      setSelectedId(null);
      insight.clear();
      return;
    }
    setSelectedId(word.id);
    if (!isLoggedIn) { onLoginRequired(); return; }
    insight.run(
      String(word.id),
      () => getWordInsight(word.word || word.sentence || '', word.translateEn || '', word.translateCh || '', lang, word.language || 'en'),
    );
  };

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setHideMeanings((v) => !v); setRevealedIds(new Set()); }}
            className={`p-1 rounded-lg transition-colors ${hideMeanings ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400'}`}
            aria-label={hideMeanings ? 'Show meanings' : 'Hide meanings'}
          >
            {hideMeanings ? (
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
          <button
            onClick={onViewAll}
            className="text-xs text-blue-500 font-medium hover:text-blue-700 dark:hover:text-blue-300"
          >
            {t('home.viewAll')}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {list.slice(0, 4).map((word, i) => {
          const isSelected = selectedId === word.id;
          return (
            <div
              key={`${word.tableName}-${word.id}-${i}`}
              className={`bg-white dark:bg-gray-800 rounded-xl border shadow-sm transition-all flex flex-col ${
                isSelected
                  ? 'rainbow-glow'
                  : 'border-gray-200 dark:border-gray-700 hover:shadow-lg hover:-translate-y-0.5'
              }`}
            >
              <div className="p-3 flex flex-col gap-0.5">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate flex-1">
                    <SentenceRenderer text={word.word || word.sentence} />
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); pronounceWord(word.word || word.sentence || '', word.language ?? lang); }}
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
                    {word.translateEn && (
                      <p className="text-xs text-blue-500 truncate">{word.translateEn}</p>
                    )}
                    {word.translateCh && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{word.translateCh}</p>
                    )}
                    {word.sentence && word.word && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic truncate mt-0.5">
                        <SentenceRenderer text={word.sentence} />
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 w-16" />
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 w-10" />
                  </div>
                )}
              </div>
              <div className="mx-3 mb-2.5 flex items-center gap-1.5">
                <button
                  onClick={() => handleInsight(word)}
                  className={`flex-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide transition-all duration-150 ${
                    isSelected
                      ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 ring-1 ring-gray-800 dark:ring-gray-100'
                      : 'text-gray-400 dark:text-gray-500 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-gray-400 dark:hover:ring-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
                  {isSelected ? `${t('llm.insight')} ▲` : t('llm.insight')}
                </button>
                {hideMeanings && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleReveal(word.id); }}
                    className="p-1 rounded-lg transition-colors text-gray-300 dark:text-gray-600 hover:text-indigo-400 dark:hover:text-indigo-400"
                    aria-label={isMeaningVisible(word.id) ? 'Hide' : 'Reveal'}
                  >
                    {isMeaningVisible(word.id) ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                )}
                {isLoggedIn && onHeartWord && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onHeartWord(word); }}
                    className="p-1 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 transition-colors"
                    aria-label={t('userVocab.addToGroup')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                )}
              </div>
              {isSelected && (
                <div className="px-3 pb-3">
                  <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 ring-1 ring-inset ring-gray-100 dark:ring-gray-700">
                    {!isLoggedIn ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t('llm.loginRequired')}</p>
                    ) : insight.loading ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">{t('llm.thinking')}</p>
                    ) : insight.error ? (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-red-400 flex-1">{t('llm.error')}</p>
                        <button
                          onClick={() => insight.retry(String(word.id), () => getWordInsight(word.word || word.sentence || '', word.translateEn || '', word.translateCh || '', lang, word.language || 'en'))}
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
  const { t, i18n } = useTranslation();
  const { isLoggedIn } = useAuth();
  const { wordStore, sentenceStore, updateWordStore, updateSentenceStore, isWordStoreEmpty, isFullyLoaded, loadFullDashboard } = useData();
  const { dueCount } = useNotifications();
  const { showLoading, hideLoading, showAlert } = useUI();
  const hasFetched = useRef(false);
  const [showAuthor, setShowAuthor] = useState(false);
  const [customGroups, setCustomGroups] = useState<CustomGroup[]>([]);
  const [heartWord, setHeartWord] = useState<Sentence | null>(null);
  const location = useLocation();
  const [showVocabOnboarding, setShowVocabOnboarding] = useState(false);

  useEffect(() => {
    if (hasFetched.current || !isWordStoreEmpty()) {
      return;
    }
    hasFetched.current = true;
    fetchPreview();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchCustomGroups().then(setCustomGroups).catch(() => {});
    }
  }, [isLoggedIn]);

  // Show vocab onboarding only after the quiz-modal onboarding has been seen.
  // Re-check every time the user navigates back to this page.
  useEffect(() => {
    if (!localStorage.getItem(VOCAB_ONBOARDING_KEY) && localStorage.getItem('onboarding:quiz_modal')) {
      setShowVocabOnboarding(true);
    }
  }, [location.key]);

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
      // Silently prefetch the full word lists in the background so "View All" is instant.
      // Runs 3 seconds after preview renders to avoid competing with visible load.
      setTimeout(() => { loadFullDashboard().catch(() => {}); }, 3000);
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
      navigate('/vocabulary/list', { state: { wordListOriginal: allData[key] ?? list, listType: key } });
      return;
    }
    showLoading();
    try {
      const { words, sentences } = await loadFullDashboard();
      const allData: Record<string, Sentence[]> = { ...words, ...sentences } as any;
      navigate('/vocabulary/list', { state: { wordListOriginal: allData[key] ?? list, listType: key } });
    } catch {
      navigate('/vocabulary/list', { state: { wordListOriginal: list, listType: key } });
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

        {/* My Vocabulary section — always visible; interactive only when logged in */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{t('userVocab.title')}</h2>
              <button
                onClick={() => setShowVocabOnboarding(true)}
                className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-[10px] font-bold flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-500 transition-colors"
                aria-label={t('userVocab.introTitle')}
              >
                ?
              </button>
            </div>
            {isLoggedIn && (
              <button
                onClick={() => navigate('/user-vocab')}
                className="text-xs text-blue-500 font-medium hover:text-blue-700 dark:hover:text-blue-300"
              >
                {t('home.viewAll')}
              </button>
            )}
          </div>

          {/* Logged-in: group cards */}
          {isLoggedIn && customGroups.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {customGroups.slice(0, 4).map((group) => (
                <button
                  key={group.id}
                  onClick={() => navigate(`/user-vocab/${group.id}`, { state: { group } })}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 text-left hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                      {group.language}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {t('userVocab.wordCount', { count: group.wordCount })}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 line-clamp-1">{group.name}</p>
                </button>
              ))}
            </div>
          )}

          {/* Logged-in: no groups yet */}
          {isLoggedIn && customGroups.length === 0 && (
            <button
              onClick={() => navigate('/user-vocab')}
              className="w-full flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-blue-300 dark:border-blue-700 p-4 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('userVocab.createFirstGroup')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{t('userVocab.emptyGroupsHint')}</p>
              </div>
            </button>
          )}

          {/* Not logged in: sign-in prompt */}
          {!isLoggedIn && (
            <button
              onClick={() => navigate('/login')}
              className="w-full flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-4 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
            >
              <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('userVocab.loginToStart')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{t('userVocab.loginToStartHint')}</p>
              </div>
            </button>
          )}
        </section>

        {allSections.map(({ key, list }) => (
          <WordSection
            key={key}
            title={t(`wordLists.${key}`, key)}
            list={list}
            onViewAll={() => handleViewAll(key, list)}
            isLoggedIn={isLoggedIn}
            lang={i18n.language}
            onLoginRequired={() => showAlert(t('llm.loginRequired'))}
            onHeartWord={isLoggedIn ? setHeartWord : undefined}
          />
        ))}
      </main>

      {showAuthor && <AuthorNoteModal onClose={() => setShowAuthor(false)} />}
      {heartWord && <AddToGroupModal word={heartWord} onClose={() => setHeartWord(null)} />}
      {showVocabOnboarding && (() => {
        const raw = t('onboarding.myVocab', { returnObjects: true });
        if (!Array.isArray(raw)) return null;
        const steps = (raw as any[]).map((s: any) => ({ icon: s.icon, iconBg: 'bg-blue-50 dark:bg-blue-900/20', title: s.title, body: s.body }));
        const dismiss = () => { localStorage.setItem(VOCAB_ONBOARDING_KEY, '1'); setShowVocabOnboarding(false); };
        return <OnboardingModal steps={steps} onDone={dismiss} onSkip={dismiss} />;
      })()}
    </div>
  );
};

export default HomePage;
