import React, { useMemo, useEffect, useRef, useState } from 'react'; // useRef kept for hasFetched
import TapToLookup from '../../components/TapToLookup';
import ReactDOM from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  CustomGroup,
  fetchCustomGroups,
  SharedVocabGroup,
  SharedGroupRequest,
  fetchSharedGroups,
  fetchPendingSharedRequests,
  approveSharedRequest,
  rejectSharedRequest,
  deleteSharedGroup,
} from '../../services/customVocab.service';
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
import { useBoard } from '../../contexts/BoardContext';

import { pronounceWord } from '../../services/tts.service';
import { getWordInsight, getWordComparison } from '../../services/llm.service';
import { useAiInsight } from '../../hooks/useAiInsight';
import OnboardingModal from '../../components/OnboardingModal';
import ArticlePreviewSection from '../../components/ArticlePreviewSection';
import { Segmented } from '../../components/ui/practice';
import { useSessionState } from '../../hooks/useSessionState';
import { useDailyGoal } from '../../contexts/DailyGoalContext';
import QuickPracticeSection from '../../components/QuickPracticeSection';
import { Button, ChevronRight, Eyebrow, GridCell, GridPanel, HelpDot, Meta, SectionHeader } from '../../components/ui';

const VOCAB_ONBOARDING_KEY = 'onboarding:my_vocab';
const SHARED_VOCAB_ONBOARDING_KEY = 'onboarding:shared_vocab';
const HIDE_MEANINGS_KEY = 'home:hideMeanings';

const WordSection: React.FC<{
  title: string;
  list: Sentence[];
  onViewAll: () => void;
  isLoggedIn: boolean;
  lang: string;
  onHeartWord?: (word: Sentence) => void;
  sectionKey: string;
  /** Optional tab row under the header (Home shows one list at a time). */
  tabs?: React.ReactNode;
}> = ({ title, list, onViewAll, isLoggedIn, lang, onHeartWord, sectionKey, tabs }) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedCompareId, setSelectedCompareId] = useState<number | null>(null);
  const insight = useAiInsight('home:insight');
  const compare = useAiInsight('home:compare');
  const lsKey = `${HIDE_MEANINGS_KEY}:${sectionKey}`;
  const [hideMeanings, setHideMeanings] = useState(() => localStorage.getItem(lsKey) !== '0');
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
    insight.run(
      String(word.id),
      () => getWordInsight(word.word || word.sentence || '', word.translateEn || '', word.translateCh || '', lang, word.language || 'en'),
    );
  };

  const handleCompare = (word: Sentence) => {
    if (selectedCompareId === word.id) {
      setSelectedCompareId(null);
      compare.clear();
      return;
    }
    setSelectedCompareId(word.id);
    compare.run(
      String(word.id),
      () => getWordComparison(word.word || word.sentence || '', word.translateEn || '', word.translateCh || '', lang, word.language || 'en'),
    );
  };

  const aiChip = (active: boolean) =>
    `inline-flex items-center h-6 px-2 rounded-sm text-[11px] tracking-wide transition-colors ${
      active ? 'bg-ink text-paper' : 'text-ink-muted border border-line hover:border-ink/40 hover:text-ink'
    }`;

  const aiPanel = (state: typeof insight, onRetry: () => void) => (
    <div className="px-3.5 pb-3.5 animate-slide-down">
      <div className="border-l-2 border-accent pl-3 py-0.5">
        {state.loading ? (
          <p className="text-xs text-ink-faint animate-pulse">{t('llm.thinking')}</p>
        ) : state.error ? (
          <div className="flex items-center gap-2">
            <p className="text-xs text-beni-500 flex-1">{t('llm.error')}</p>
            <button onClick={onRetry} className="text-xs text-ink-muted underline underline-offset-2">↺</button>
          </div>
        ) : (
          <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">
            <TapToLookup>{state.text}</TapToLookup>
          </p>
        )}
      </div>
    </div>
  );

  const eyeIcon = (closed: boolean, cls: string) => (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      {closed ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </>
      )}
    </svg>
  );

  return (
    <section className="mb-10">
      <SectionHeader
        title={title}
        extra={
          <button
            onClick={() => { setHideMeanings((v) => { const next = !v; localStorage.setItem(lsKey, next ? '1' : '0'); return next; }); setRevealedIds(new Set()); }}
            className={`p-1 transition-colors ${hideMeanings ? 'text-accent' : 'text-ink-faint hover:text-ink-muted'}`}
            aria-label={hideMeanings ? 'Show meanings' : 'Hide meanings'}
          >
            {eyeIcon(hideMeanings, 'w-4 h-4')}
          </button>
        }
        action={{ label: t('home.viewAll'), onClick: onViewAll }}
      />
      {tabs && <div className="-mx-5 px-5 mb-4 overflow-x-auto scrollbar-hide">{tabs}</div>}
      <GridPanel>
        {list.slice(0, 4).map((word, i) => {
          const isSelected = selectedId === word.id;
          const isCompareSelected = selectedCompareId === word.id;
          return (
            <div
              key={`${word.tableName}-${word.id}-${i}`}
              className={`bg-surface flex flex-col animate-fade-in-up`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="p-3.5 pb-2 flex flex-col gap-1 flex-1">
                <div className="flex items-start gap-1">
                  <p className="font-serif text-[17px] leading-snug text-ink break-words flex-1 min-w-0">
                    <SentenceRenderer text={word.word || word.sentence} />
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); pronounceWord(word.word || word.sentence || '', word.language ?? lang); }}
                    className="shrink-0 p-1 -mr-1 text-ink-faint hover:text-accent transition-colors"
                    aria-label="Pronounce"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  </button>
                  {hideMeanings && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleReveal(word.id); }}
                      className="shrink-0 p-1 -mr-1 text-ink-faint hover:text-accent transition-colors"
                      aria-label={isMeaningVisible(word.id) ? 'Hide' : 'Reveal'}
                    >
                      {eyeIcon(isMeaningVisible(word.id), 'w-3.5 h-3.5')}
                    </button>
                  )}
                </div>
                {isMeaningVisible(word.id) ? (
                  <>
                    {word.translateEn && <p className="text-xs text-ink-muted break-words">{word.translateEn}</p>}
                    {word.translateCh && <p className="text-xs text-ink-muted break-words">{word.translateCh}</p>}
                    {word.sentence && word.word && (
                      <p className="text-[11px] text-ink-faint mt-1 leading-relaxed max-h-16 overflow-y-auto break-words">
                        <SentenceRenderer text={word.sentence} />
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="h-1.5 rounded-sm bg-line w-14" />
                    <div className="h-1.5 rounded-sm bg-line w-8" />
                  </div>
                )}
              </div>
              <div className="px-3.5 pb-3 flex items-center gap-1.5">
                <button data-analytics="ai.insight" onClick={() => handleInsight(word)} className={aiChip(isSelected)}>
                  {t('llm.insight')}
                </button>
                <button data-analytics="ai.compare" onClick={() => handleCompare(word)} className={aiChip(isCompareSelected)}>
                  {t('llm.compare')}
                </button>
                {isLoggedIn && onHeartWord && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onHeartWord(word); }}
                    className="ml-auto p-1 -mr-1 text-ink-faint hover:text-beni-500 transition-colors"
                    aria-label={t('userVocab.addToGroup')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                )}
              </div>
              {isSelected && aiPanel(insight, () => insight.retry(String(word.id), () => getWordInsight(word.word || word.sentence || '', word.translateEn || '', word.translateCh || '', lang, word.language || 'en')))}
              {isCompareSelected && aiPanel(compare, () => compare.retry(String(word.id), () => getWordComparison(word.word || word.sentence || '', word.translateEn || '', word.translateCh || '', lang, word.language || 'en')))}
            </div>
          );
        })}
      </GridPanel>
    </section>
  );
};

const AuthorNoteModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const paragraphs = t('authorNote.body').split('\n\n');

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-safe" onClick={onClose}>
      <div
        className="bg-surface rounded-t-xl sm:rounded-lg border border-line w-full max-w-sm animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-ink/20" />
        </div>

        <div className="px-6 pt-4 pb-6">
          {/* Avatar + title */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full border border-line flex items-center justify-center shrink-0 font-serif text-ink">R</div>
            <h2 className="font-serif text-base text-ink">{t('authorNote.title')}</h2>
            <button
              onClick={onClose}
              className="ml-auto text-ink-faint hover:text-ink-muted p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="text-sm text-ink-muted leading-relaxed space-y-3 mb-5 max-h-52 overflow-y-auto pr-1">
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>

          {/* Social links */}
          <div className="flex items-center gap-3 pt-4 border-t border-line">
            <a
              href="https://www.linkedin.com/in/ryan-tseng-4161ab83/"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-md border border-line flex items-center justify-center text-ink-muted hover:text-ink hover:border-ink/40 transition-colors"
              aria-label="LinkedIn"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            <a
              href="mailto:ts00328685@gmail.com"
              className="w-9 h-9 rounded-md border border-line flex items-center justify-center text-ink-muted hover:text-ink hover:border-ink/40 transition-colors"
              aria-label="Email"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { isLoggedIn, hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['ADMIN']);
  const { wordStore, previewWordStore, sentenceStore, updateWordStore, updatePreviewWordStore, updateSentenceStore, isWordStoreEmpty, isFullyLoaded, loadFullDashboard } = useData();
  const { dueCount } = useNotifications();
  const { activeSession } = useBoard();
  const { showLoading, hideLoading, showAlert } = useUI();
  const hasFetched = useRef(false);
  const [showAuthor, setShowAuthor] = useState(false);
  const [customGroups, setCustomGroups] = useState<CustomGroup[]>([]);
  const [sharedGroups, setSharedGroups] = useState<SharedVocabGroup[]>([]);
  /** Newest shared groups first; the home page only shows the top 4. */
  const sortedSharedGroups = useMemo(
    () => [...sharedGroups].sort((a, b) => (new Date(b.createDate).getTime() || 0) - (new Date(a.createDate).getTime() || 0)),
    [sharedGroups],
  );
  const [pendingRequests, setPendingRequests] = useState<SharedGroupRequest[]>([]);
  const [adminActionLoading, setAdminActionLoading] = useState<number | null>(null);
  const [heartWord, setHeartWord] = useState<Sentence | null>(null);
  const location = useLocation();
  const [showVocabOnboarding, setShowVocabOnboarding] = useState(false);
  const [showSharedVocabOnboarding, setShowSharedVocabOnboarding] = useState(false);
  const { config: goalConfig, unfinishedCount: goalsLeft, hasGoals } = useDailyGoal();
  // Tabs remember the last choice across visits.
  const [readingLang, setReadingLang] = useSessionState<'ja' | 'en'>('home:readingLang', 'ja', { kind: 'local' });
  const [wordbookTab, setWordbookTab] = useSessionState<'mine' | 'shared'>('home:wordbookTab', 'mine', { kind: 'local' });
  const [wordTab, setWordTab] = useSessionState('home:wordTab', 'wordEnglishList', { kind: 'local' });


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

  useEffect(() => {
    fetchSharedGroups().then(setSharedGroups).catch(() => {});
  }, []);

  useEffect(() => {
    if (isLoggedIn && isAdmin) {
      fetchPendingSharedRequests().then(setPendingRequests).catch(() => {});
    }
  }, [isLoggedIn, isAdmin]);

  const handleApproveRequest = async (shareId: number) => {
    setAdminActionLoading(shareId);
    try {
      await approveSharedRequest(shareId);
      setPendingRequests((prev) => prev.filter((r) => r.id !== shareId));
      fetchSharedGroups().then(setSharedGroups).catch(() => {});
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleRejectRequest = async (shareId: number) => {
    setAdminActionLoading(shareId);
    try {
      await rejectSharedRequest(shareId);
      setPendingRequests((prev) => prev.filter((r) => r.id !== shareId));
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleDeleteSharedGroup = async (e: React.MouseEvent, shareId: number) => {
    e.stopPropagation();
    if (!window.confirm(t('sharedVocab.deleteConfirm', 'Delete this shared group? This cannot be undone.'))) return;
    setAdminActionLoading(shareId);
    try {
      await deleteSharedGroup(shareId);
      setSharedGroups((prev) => prev.filter((g) => g.id !== shareId));
    } finally {
      setAdminActionLoading(null);
    }
  };

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

      updatePreviewWordStore(words);

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
      // setTimeout(() => { loadFullDashboard().catch(() => {}); }, 3000);
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
    { key: 'wordEnglishList', list: previewWordStore.wordEnglishList },
    { key: 'wordGermanList', list: previewWordStore.wordGermanList },
    { key: 'wordJapaneseList', list: previewWordStore.wordJapaneseList },
    { key: 'wordJapaneseVerbList', list: previewWordStore.wordJapaneseVerbList },
    { key: 'sentenceEnglishList', list: sentenceStore.sentenceEnglishList },
    { key: 'sentenceGermanList', list: sentenceStore.sentenceGermanList },
    { key: 'sentenceJapaneseList', list: sentenceStore.sentenceJapaneseList },
  ];

  const hasData = allSections.some((s) => s.list?.length > 0);
  const wordTabs = allSections.filter((s) => s.list?.length > 0);
  const activeWords = wordTabs.find((s) => s.key === wordTab) ?? wordTabs[0];

  const goalTotal = (['japanese', 'english'] as const)
    .reduce((n, lang) => n + Object.values(goalConfig[lang]).filter((v) => v > 0).length, 0);
  const goalsDone = goalTotal - goalsLeft;
  const today = new Date().toLocaleDateString(i18n.language === 'zh' ? 'zh-TW' : i18n.language, { month: 'long', day: 'numeric', weekday: 'short' });

  return (
    <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
      <Header title="Heloword" />

      <main className="flex-1 pb-24 px-5 pt-6 max-w-2xl mx-auto w-full">
        {activeSession && (
          <button
            onClick={() => navigate(`/board/${activeSession.id}`)}
            className="w-full flex items-center gap-3 bg-surface border border-line rounded-md px-4 py-3 mb-6 text-left hover:border-ink/30 transition-colors"
          >
            <span className="relative flex w-2 h-2 shrink-0">
              <span className="absolute inset-0 rounded-full bg-beni-500 animate-ping opacity-50" />
              <span className="relative w-2 h-2 rounded-full bg-beni-500" />
            </span>
            <div className="flex-1 min-w-0">
              <Eyebrow>{t('board.liveNow', 'Live now')}</Eyebrow>
              <p className="text-sm text-ink mt-0.5 truncate">{activeSession.name}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
          </button>
        )}

        {/* Today — one clear next step: review what's due, otherwise learn new words */}
        <section className="mb-10">
          <Eyebrow>{today}</Eyebrow>
          {dueCount > 0 ? (
            <>
              <h2 className="font-serif text-[26px] leading-snug text-ink mt-3">{t('home.dueWords', { count: dueCount })}</h2>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">{t('home.dueCurve')}</p>
            </>
          ) : (
            <>
              <h2 className="font-serif text-[26px] leading-snug text-ink mt-3">{t('home.quizTitle')}</h2>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">{t('home.nothingDue')}</p>
            </>
          )}
          <div className="mt-5 flex items-center gap-5">
            {dueCount > 0 ? (
              <>
                <Button onClick={() => navigate('/review')}>
                  {t('home.reviewNow', { count: dueCount })}
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
                <button onClick={() => navigate('/vocabulary')} className="text-sm text-ink-muted hover:text-ink transition-colors">
                  {t('home.startQuiz')}
                </button>
              </>
            ) : (
              <Button onClick={() => navigate('/vocabulary')}>
                {t('home.startQuiz')}
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          {/* Daily goal at a glance */}
          <button
            onClick={() => navigate('/stats')}
            className="mt-6 w-full flex items-center gap-3 border-t border-line pt-4 text-left group"
          >
            {hasGoals ? (
              <>
                <span className="text-xs text-ink-muted shrink-0">{t('home.goalProgress', { done: goalsDone, total: goalTotal })}</span>
                <span className="flex-1 h-[3px] rounded-full bg-ink/10 overflow-hidden">
                  <span
                    className={`block h-full rounded-full ${goalsLeft === 0 ? 'bg-success' : 'bg-ink'}`}
                    style={{ width: `${goalTotal ? (goalsDone / goalTotal) * 100 : 0}%` }}
                  />
                </span>
              </>
            ) : (
              <span className="flex-1 text-xs text-ink-muted group-hover:text-ink transition-colors">{t('home.setGoal')}</span>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-ink-faint shrink-0" />
          </button>
        </section>

        <QuickPracticeSection />
        <ArticlePreviewSection
          sourceLang={readingLang}
          title={t('home.reading')}
          listRoute={readingLang === 'ja' ? '/nhk-articles' : '/en-articles'}
          detailRoutePrefix={readingLang === 'ja' ? '/nhk-articles' : '/en-articles'}
          viewAllLabel={t('home.viewAll')}
          extra={
            <span className="ml-3">
              <Segmented
                size="sm"
                value={readingLang}
                onChange={setReadingLang}
                options={[{ value: 'ja', label: t('home.tabJa') }, { value: 'en', label: t('home.tabEn') }]}
              />
            </span>
          }
        />

        {!hasData && (
          <div className="text-center py-12">
            <div className="w-6 h-6 border-2 border-line border-t-accent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-ink-faint">{t('home.loading')}</p>
          </div>
        )}

        {/* Word lists — mine | shared */}
        <section className="mb-10">
          <SectionHeader
            title={t('home.wordbooks')}
            extra={
              <span className="ml-3 inline-flex items-center gap-2">
                <Segmented
                  size="sm"
                  value={wordbookTab}
                  onChange={setWordbookTab}
                  options={[{ value: 'mine', label: t('userVocab.title') }, { value: 'shared', label: t('sharedVocab.title') }]}
                />
                <HelpDot
                  onClick={() => (wordbookTab === 'mine' ? setShowVocabOnboarding(true) : setShowSharedVocabOnboarding(true))}
                  label={wordbookTab === 'mine' ? t('userVocab.introTitle') : t('sharedVocab.title')}
                />
              </span>
            }
            action={wordbookTab === 'mine'
              ? (isLoggedIn ? { label: t('home.viewAll'), onClick: () => navigate('/user-vocab') } : undefined)
              : (sharedGroups.length > 4 ? { label: t('sharedVocab.viewAll'), onClick: () => navigate('/shared-vocab') } : undefined)}
          />

          {wordbookTab === 'mine' && (<>
          {isLoggedIn && customGroups.length > 0 && (
            <GridPanel>
              {customGroups.slice(0, 4).map((group) => (
                <GridCell key={group.id} onClick={() => navigate(`/user-vocab/${group.id}`, { state: { group } })}>
                  <div className="flex items-center gap-2">
                    <Meta>{group.language}</Meta>
                    <span className="text-[10px] text-ink-faint tabular-nums">{t('userVocab.wordCount', { count: group.wordCount })}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink line-clamp-1">{group.name}</p>
                  {group.tags && <TagLine tags={group.tags} />}
                </GridCell>
              ))}
            </GridPanel>
          )}

          {isLoggedIn && (
            <button
              data-analytics="home.photo_words"
              onClick={() => navigate('/photo-words')}
              className="mt-3 w-full h-11 flex items-center justify-center gap-2 rounded-md border border-line bg-surface text-sm text-ink hover:border-ink/30 transition-colors"
            >
              <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
              {t('photoWords.shortcut')}
            </button>
          )}

          {isLoggedIn && customGroups.length === 0 && (
            <EmptyAction
              onClick={() => navigate('/user-vocab')}
              title={t('userVocab.createFirstGroup')}
              hint={t('userVocab.emptyGroupsHint')}
              icon="M12 4v16m8-8H4"
            />
          )}

          {!isLoggedIn && (
            <EmptyAction
              onClick={() => navigate('/login')}
              title={t('userVocab.loginToStart')}
              hint={t('userVocab.loginToStartHint')}
              icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          )}
          </>)}

          {wordbookTab === 'shared' && (<>
          {/* Admin: pending requests */}
          {isAdmin && pendingRequests.length > 0 && (
            <div className="mb-4 border-l-2 border-kincha-400 pl-3">
              <Eyebrow className="mb-2">
                {t('sharedVocab.adminPendingTitle')} ({pendingRequests.length})
              </Eyebrow>
              <ul className="divide-y divide-line border-y border-line">
                {pendingRequests.map((req) => (
                  <li key={req.id} className="flex items-center gap-2 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink truncate">{req.name}</p>
                      <p className="text-[11px] text-ink-faint">
                        {req.requesterDisplayName} · {t('userVocab.wordCount', { count: req.wordCount })}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => handleApproveRequest(req.id)} disabled={adminActionLoading === req.id}>
                      {adminActionLoading === req.id ? '…' : t('sharedVocab.approve')}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleRejectRequest(req.id)} disabled={adminActionLoading === req.id}>
                      {adminActionLoading === req.id ? '…' : t('sharedVocab.reject')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sharedGroups.length > 0 ? (
            <GridPanel>
              {sortedSharedGroups.slice(0, 4).map((sg) => (
                <GridCell key={sg.id} onClick={() => navigate(`/shared-vocab/${sg.id}`, { state: { group: sg } })}>
                  {isAdmin && (
                    <span
                      role="button"
                      onClick={(e) => handleDeleteSharedGroup(e, sg.id)}
                      className={`absolute top-2.5 right-2.5 p-0.5 text-ink-faint hover:text-beni-500 transition-colors ${adminActionLoading === sg.id ? 'opacity-40 pointer-events-none' : ''}`}
                      aria-label={t('sharedVocab.delete', 'Delete')}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <Meta>{sg.language}</Meta>
                    <span className="text-[10px] text-ink-faint tabular-nums">{t('userVocab.wordCount', { count: sg.wordCount })}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink line-clamp-1">{sg.name}</p>
                  <p className="text-[10px] text-ink-faint mt-1 truncate">
                    {t('sharedVocab.sharedBy', { name: sg.sharerDisplayName })}
                    {sg.createDate && <> · {new Date(sg.createDate).toLocaleDateString('zh-TW')}</>}
                  </p>
                  {sg.tags && <TagLine tags={sg.tags} />}
                </GridCell>
              ))}
            </GridPanel>
          ) : (
            <p className="text-xs text-ink-faint text-center py-8 border-y border-line">
              {t('sharedVocab.noSharedGroups')}
            </p>
          )}
          </>)}
        </section>

        {activeWords && (
          <WordSection
            key={activeWords.key}
            sectionKey={activeWords.key}
            title={t('home.wordPreview')}
            list={activeWords.list}
            onViewAll={() => handleViewAll(activeWords.key, activeWords.list)}
            isLoggedIn={isLoggedIn}
            lang={i18n.language}
            onHeartWord={isLoggedIn ? setHeartWord : undefined}
            tabs={wordTabs.length > 1 && (
              <Segmented
                size="sm"
                value={activeWords.key}
                onChange={setWordTab}
                options={wordTabs.map((s) => ({ value: s.key, label: t(`wordLists.${s.key}`, s.key) }))}
              />
            )}
          />
        )}

        <footer className="pt-6 mt-4 border-t border-line text-center">
          <button
            onClick={() => setShowAuthor(true)}
            className="text-xs text-ink-faint hover:text-ink-muted transition-colors"
          >
            {t('authorNote.buttonLabel')}
          </button>
        </footer>
      </main>

      {showAuthor && <AuthorNoteModal onClose={() => setShowAuthor(false)} />}
      {heartWord && <AddToGroupModal word={heartWord} onClose={() => setHeartWord(null)} />}
      {showVocabOnboarding && (() => {
        const raw = t('onboarding.myVocab', { returnObjects: true });
        if (!Array.isArray(raw)) return null;
        const steps = (raw as any[]).map((s: any) => ({ icon: s.icon, iconBg: 'bg-paper', title: s.title, body: s.body }));
        const dismiss = () => { localStorage.setItem(VOCAB_ONBOARDING_KEY, '1'); setShowVocabOnboarding(false); };
        return <OnboardingModal steps={steps} onDone={dismiss} onSkip={dismiss} />;
      })()}
      {showSharedVocabOnboarding && (() => {
        const raw = t('onboarding.sharedVocab', { returnObjects: true });
        if (!Array.isArray(raw)) return null;
        const steps = (raw as any[]).map((s: any) => ({ icon: s.icon, iconBg: 'bg-paper', title: s.title, body: s.body }));
        const dismiss = () => { localStorage.setItem(SHARED_VOCAB_ONBOARDING_KEY, '1'); setShowSharedVocabOnboarding(false); };
        return <OnboardingModal steps={steps} onDone={dismiss} onSkip={dismiss} />;
      })()}
    </div>
  );
};

/** "#tag  #tag" in faint text — no chips. */
const TagLine: React.FC<{ tags: string }> = ({ tags }) => (
  <p className="mt-1.5 text-[10px] text-ink-faint truncate">
    {tags.split(',').map((s) => s.trim()).filter(Boolean).map((tag) => `#${tag}`).join('  ')}
  </p>
);

/** Dashed hairline call-to-action used for empty / signed-out states. */
const EmptyAction: React.FC<{ onClick: () => void; title: string; hint: string; icon: string }> = ({ onClick, title, hint, icon }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-4 rounded-md border border-dashed border-line px-4 py-4 text-left hover:border-ink/30 transition-colors"
  >
    <svg className="w-5 h-5 text-ink-faint shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
    </svg>
    <div>
      <p className="text-sm text-ink">{title}</p>
      <p className="text-xs text-ink-muted mt-0.5">{hint}</p>
    </div>
  </button>
);

export default HomePage;
