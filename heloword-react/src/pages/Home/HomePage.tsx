import React, { useEffect, useRef, useState } from 'react'; // useRef kept for hasFetched
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

import { pronounceWord, speakSentence, cancelPronouncing } from '../../services/tts.service';
import { getWordInsight, getWordComparison } from '../../services/llm.service';
import { useAiInsight } from '../../hooks/useAiInsight';
import OnboardingModal from '../../components/OnboardingModal';
import { FunArticle, fetchAllFunArticles } from '../../services/funArticle.service';
import NHKSection from '../../components/NHKSection';
import ENSection from '../../components/ENSection';
import ReactMarkdown from 'react-markdown';
import { latexToUnicode } from '../../utils/latexToUnicode';

const VOCAB_ONBOARDING_KEY = 'onboarding:my_vocab';
const SHARED_VOCAB_ONBOARDING_KEY = 'onboarding:shared_vocab';
const HIDE_MEANINGS_KEY = 'home:hideMeanings';

const WordSection: React.FC<{
  title: string;
  list: Sentence[];
  onViewAll: () => void;
  isLoggedIn: boolean;
  lang: string;
  onLoginRequired: () => void;
  onHeartWord?: (word: Sentence) => void;
  sectionKey: string;
}> = ({ title, list, onViewAll, isLoggedIn, lang, onLoginRequired, onHeartWord, sectionKey }) => {
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
    if (!isLoggedIn) { onLoginRequired(); return; }
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
    if (!isLoggedIn) { onLoginRequired(); return; }
    compare.run(
      String(word.id),
      () => getWordComparison(word.word || word.sentence || '', word.translateEn || '', word.translateCh || '', lang, word.language || 'en'),
    );
  };

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setHideMeanings((v) => { const next = !v; localStorage.setItem(lsKey, next ? '1' : '0'); return next; }); setRevealedIds(new Set()); }}
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
          const isCompareSelected = selectedCompareId === word.id;
          return (
            <div
              key={`${word.tableName}-${word.id}-${i}`}
              className={`bg-white dark:bg-white/[0.05] dark:backdrop-blur-sm rounded-xl border shadow-sm dark:shadow-[0_2px_12px_rgba(0,0,0,0.55)] transition-all flex flex-col animate-fade-in-up ${
                isSelected || isCompareSelected
                  ? 'rainbow-glow'
                  : 'border-gray-200 dark:border-white/[0.14] hover:shadow-lg dark:hover:shadow-[0_4px_20px_rgba(255,255,255,0.04)] hover:-translate-y-0.5'
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
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
                  {hideMeanings && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleReveal(word.id); }}
                      className="shrink-0 p-0.5 rounded text-gray-300 dark:text-gray-600 hover:text-indigo-400 dark:hover:text-indigo-400 transition-colors"
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
                </div>
                {isMeaningVisible(word.id) ? (
                  <>
                    {word.translateEn && (
                      <p className="text-xs text-blue-500 break-words">{word.translateEn}</p>
                    )}
                    {word.translateCh && (
                      <p className="text-xs text-gray-500 dark:text-gray-300 break-words">{word.translateCh}</p>
                    )}
                    {word.sentence && word.word && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-0.5 max-h-16 overflow-y-auto break-words">
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
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide transition-all duration-150 ${
                    isSelected
                      ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 ring-1 ring-gray-800 dark:ring-gray-100'
                      : 'text-gray-400 dark:text-gray-500 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-gray-400 dark:hover:ring-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
                  {isSelected ? `${t('llm.insight')} ▲` : t('llm.insight')}
                </button>
                <button
                  onClick={() => handleCompare(word)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide transition-all duration-150 ${
                    isCompareSelected
                      ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 ring-1 ring-gray-800 dark:ring-gray-100'
                      : 'text-gray-400 dark:text-gray-500 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-gray-400 dark:hover:ring-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z"/></svg>
                  {isCompareSelected ? `${t('llm.compare')} ▲` : t('llm.compare')}
                </button>
                {isLoggedIn && onHeartWord && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onHeartWord(word); }}
                    className="ml-auto p-1 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 transition-colors"
                    aria-label={t('userVocab.addToGroup')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                )}
              </div>
              {isSelected && (
                <div className="px-3 pb-3 animate-slide-down">
                  <div className="bg-gray-50 dark:bg-white/[0.04] dark:backdrop-blur-sm rounded-xl p-3 ring-1 ring-inset ring-gray-100 dark:ring-white/[0.06]">
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
              {isCompareSelected && (
                <div className="px-3 pb-3 animate-slide-down">
                  <div className="bg-gray-50 dark:bg-white/[0.04] dark:backdrop-blur-sm rounded-xl p-3 ring-1 ring-inset ring-gray-100 dark:ring-white/[0.06]">
                    {!isLoggedIn ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t('llm.loginRequired')}</p>
                    ) : compare.loading ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">{t('llm.thinking')}</p>
                    ) : compare.error ? (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-red-400 flex-1">{t('llm.error')}</p>
                        <button
                          onClick={() => compare.retry(String(word.id), () => getWordComparison(word.word || word.sentence || '', word.translateEn || '', word.translateCh || '', lang, word.language || 'en'))}
                          className="text-xs text-blue-400 underline"
                        >↺</button>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                        {compare.text}
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

  return ReactDOM.createPortal(
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
          <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-3 max-h-52 overflow-y-auto pr-1">
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const PREVIEW_LENGTH = 180;

function stripWordHeading(word: string, content: string): string {
  // Remove leading markdown heading/bold/plain line that matches the word
  return content
    .replace(new RegExp(`^#{1,6}\\s*\\*{0,2}${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*{0,2}\\s*\\n+`, 'i'), '')
    .replace(new RegExp(`^\\*{1,2}${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*{1,2}\\s*\\n+`, 'i'), '')
    .replace(new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+`, 'i'), '')
    .trimStart();
}

/** Strip markdown syntax so TTS doesn't read asterisks, hashes, etc. */
function stripMarkdownForTTS(text: string, langCode?: string): string {
  let result = text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/\*(.*?)\*/gs, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n');
  // For Japanese, strip furigana annotations like 探偵(たんてい) — kana in parens repeat the kanji
  if (langCode === 'ja-JP') {
    result = result.replace(/\([^)]*[\u3040-\u30FF][^)]*\)/g, '');
  }
  return result.trim();
}

/** Split article content into per-language sections. */
function parseArticleSections(content: string): { en: string; zh?: string; ja?: string } {
  const zhIdx = content.search(/繁體中文翻譯/);
  const jaIdx = content.search(/日本語訳/);
  const en = zhIdx > -1 ? content.slice(0, zhIdx) : jaIdx > -1 ? content.slice(0, jaIdx) : content;
  const zh = zhIdx > -1 ? (jaIdx > -1 ? content.slice(zhIdx, jaIdx) : content.slice(zhIdx)) : undefined;
  const ja = jaIdx > -1 ? content.slice(jaIdx) : undefined;
  return { en: en.trim(), zh: zh?.trim(), ja: ja?.trim() };
}

const AiMarkdown: React.FC<{ text: string }> = ({ text }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <p className="leading-relaxed">{children}</p>,
      h1: ({ children }) => <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-3">{children}</p>,
      h2: ({ children }) => <p className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-2">{children}</p>,
      h3: ({ children }) => <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mt-2">{children}</p>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      ul: ({ children }) => <ul className="list-disc list-outside pl-5 space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-outside pl-5 space-y-1">{children}</ol>,
      li: ({ children }) => <li>{children}</li>,
    }}
  >
    {latexToUnicode(text)}
  </ReactMarkdown>
);

const ArticleItem: React.FC<{ article: FunArticle; index: number }> = ({ article, index }) => {
  const [activeLang, setActiveLang] = React.useState<string | null>(null);

  const sections = React.useMemo(
    () => parseArticleSections(stripWordHeading(article.word, article.content)),
    [article],
  );

  const speakSection = (text: string, langCode: string, langKey: string) => {
    cancelPronouncing();
    if (activeLang === langKey) {
      setActiveLang(null);
      return;
    }
    setActiveLang(langKey);
    speakSentence(stripMarkdownForTTS(text, langCode), langCode, {}, () => setActiveLang(null));
  };

  const speakWord = (e: React.MouseEvent) => {
    e.stopPropagation();
    pronounceWord(article.word, 'en');
  };

  const langBtn = (label: string, text: string, langCode: string, langKey: string) => (
    <button
      onClick={() => speakSection(text, langCode, langKey)}
      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors flex items-center gap-1 ${
        activeLang === langKey
          ? 'bg-sky-500 text-white'
          : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-sky-100 dark:hover:bg-sky-900/40'
      }`}
    >
      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5zm4.54 3.46a5 5 0 010 7.07" />
      </svg>
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-sky-400 to-blue-500 dark:from-sky-600 dark:to-blue-700 px-4 py-2.5 flex items-center gap-2.5">
        <span className="text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full bg-white/20 text-white shrink-0">
          {index + 1}
        </span>
        <span className="text-base font-bold text-white tracking-wide flex-1">{article.word}</span>
        <button
          onClick={speakWord}
          title="Pronounce word"
          className="text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/20"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5zm4.54 3.46a5 5 0 010 7.07" />
          </svg>
        </button>
      </div>
      <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 leading-relaxed space-y-2">
        <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-200 dark:border-gray-600">
          {langBtn('EN', sections.en, 'en-US', 'en')}
          {sections.zh && langBtn('中', sections.zh, 'zh-TW', 'zh')}
          {sections.ja && langBtn('日', sections.ja, 'ja-JP', 'ja')}
        </div>
        <AiMarkdown text={stripWordHeading(article.word, article.content)} />
      </div>
    </div>
  );
};

const FunArticlesModal: React.FC<{ articles: FunArticle[]; onClose: () => void }> = ({ articles, onClose }) => {
  const { t } = useTranslation();

  React.useEffect(() => () => { cancelPronouncing(); }, []);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-safe" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        <div className="px-5 pt-4 pb-3 flex items-center justify-between shrink-0 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-lg">📚</span>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{t('home.funArticleTitle')}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {articles.map((a, i) => (
            <ArticleItem key={i} article={a} index={i} />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

const FunArticlesSection: React.FC = () => {
  const { t } = useTranslation();
  const [allArticles, setAllArticles] = React.useState<FunArticle[]>([]);
  const [showModal, setShowModal] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadArticles = React.useCallback(() => {
    fetchAllFunArticles().then(setAllArticles).catch(() => {});
  }, []);

  React.useEffect(() => { loadArticles(); }, [loadArticles]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const articles = await fetchAllFunArticles();
      setAllArticles(articles);
    } finally {
      setRefreshing(false);
    }
  };

  const handleViewAll = () => setShowModal(true);

  const preview = allArticles[0] ?? null;
  if (!preview) return null;

  const cleanContent = stripWordHeading(preview.word, preview.content);
  const truncated = cleanContent.length > PREVIEW_LENGTH
    ? cleanContent.slice(0, PREVIEW_LENGTH).trimEnd() + '…'
    : cleanContent;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{t('home.funArticleTitle')}</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-40 transition-colors"
            aria-label="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>
        </div>
      </div>
      <button
        onClick={handleViewAll}
        className="w-full text-left rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
      >
        {/* Gradient header with word */}
        <div className="bg-gradient-to-r from-sky-400 to-blue-500 dark:from-sky-600 dark:to-blue-700 px-4 pt-3.5 pb-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] mb-1 text-white/50">Featured Word</p>
            <h3 className="text-white text-xl font-bold tracking-wide">{preview.word}</h3>
          </div>
          <div className="flex flex-col items-center opacity-75 group-hover:opacity-100 group-hover:scale-110 transition-all select-none leading-none">
            <span className="text-white font-bold" style={{ fontFamily: 'serif', fontSize: '1.35rem', lineHeight: 1 }}>文</span>
            <div className="w-5 border-t border-white/60 my-0.5" />
            <span className="text-white/90 font-semibold tracking-widest" style={{ fontSize: '0.6rem', letterSpacing: '0.18em' }}>EN</span>
          </div>
        </div>
        {/* Article preview */}
        <div className="bg-white dark:bg-white/[0.05] dark:backdrop-blur-sm border border-t-0 border-sky-100 dark:border-sky-900/40 px-4 py-3 rounded-b-2xl">
          <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">
            <AiMarkdown text={truncated} />
          </div>
          <p className="mt-2 text-xs text-sky-400 font-medium">{t('home.tapToReadMore')}</p>
        </div>
      </button>
      {showModal && <FunArticlesModal articles={allArticles} onClose={() => setShowModal(false)} />}
    </section>
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
  const [pendingRequests, setPendingRequests] = useState<SharedGroupRequest[]>([]);
  const [adminActionLoading, setAdminActionLoading] = useState<number | null>(null);
  const [heartWord, setHeartWord] = useState<Sentence | null>(null);
  const location = useLocation();
  const [showVocabOnboarding, setShowVocabOnboarding] = useState(false);
  const [showSharedVocabOnboarding, setShowSharedVocabOnboarding] = useState(false);


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

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title="Heloword" />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        {activeSession && (
          <div
            onClick={() => navigate(`/board/${activeSession.id}`)}
            className="notification-breathe flex items-center gap-3 bg-gradient-to-br from-red-500 to-pink-600 text-white rounded-2xl p-4 mb-6 cursor-pointer hover:from-red-600 hover:to-pink-700 transition-colors shadow-lg"
          >
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6m-6 8l-4-4h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                {t('board.liveNow', 'Live now')}
              </p>
              <p className="text-xs text-white/90 mt-0.5 truncate">{activeSession.name}</p>
            </div>
            <svg className="w-4 h-4 text-white/80 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}

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
            className="notification-breathe flex items-center gap-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-4 mb-5 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
          >
            <div className="bell-shine w-10 h-10 bg-orange-100 dark:bg-orange-900/40 rounded-xl flex items-center justify-center shrink-0">
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

        <FunArticlesSection />
        <NHKSection />
        <ENSection />

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
                  className="bg-white dark:bg-white/[0.05] dark:backdrop-blur-sm rounded-xl border border-gray-200 dark:border-white/[0.14] shadow-sm dark:shadow-[0_2px_12px_rgba(0,0,0,0.55)] p-3 text-left hover:shadow-lg dark:hover:shadow-[0_4px_20px_rgba(255,255,255,0.04)] hover:-translate-y-0.5 transition-all"
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
                  {group.tags && (
                    <div className="flex gap-1 mt-1.5 overflow-x-auto scrollbar-hide">
                      {group.tags.split(',').map(s => s.trim()).filter(Boolean).map(tag => (
                        <span key={tag} className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Logged-in: no groups yet */}
          {isLoggedIn && customGroups.length === 0 && (
            <button
              onClick={() => navigate('/user-vocab')}
              className="w-full flex items-center gap-3 bg-white dark:bg-white/[0.04] dark:backdrop-blur-sm rounded-2xl border border-dashed border-blue-300 dark:border-blue-700 p-4 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
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
              className="w-full flex items-center gap-3 bg-white dark:bg-white/[0.04] dark:backdrop-blur-sm rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-4 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
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

        {/* Shared Vocabulary section */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{t('sharedVocab.title')}</h2>
              <button
                onClick={() => setShowSharedVocabOnboarding(true)}
                className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-[10px] font-bold flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-500 transition-colors"
                aria-label={t('sharedVocab.title')}
              >
                ?
              </button>
            </div>
            {sharedGroups.length > 4 && (
              <button
                onClick={() => navigate('/shared-vocab')}
                className="text-xs text-blue-500 font-medium hover:text-blue-700 dark:hover:text-blue-300"
              >
                {t('sharedVocab.viewAll')}
              </button>
            )}
          </div>

          {/* Admin: pending requests */}
          {isAdmin && pendingRequests.length > 0 && (
            <div className="mb-3 rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
                {t('sharedVocab.adminPendingTitle')} ({pendingRequests.length})
              </p>
              <ul className="space-y-2">
                {pendingRequests.map((req) => (
                  <li key={req.id} className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-amber-100 dark:border-amber-800">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{req.name}</p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">
                        {req.requesterDisplayName} · {t('userVocab.wordCount', { count: req.wordCount })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleApproveRequest(req.id)}
                      disabled={adminActionLoading === req.id}
                      className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white transition-colors"
                    >
                      {adminActionLoading === req.id ? '…' : t('sharedVocab.approve')}
                    </button>
                    <button
                      onClick={() => handleRejectRequest(req.id)}
                      disabled={adminActionLoading === req.id}
                      className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white transition-colors"
                    >
                      {adminActionLoading === req.id ? '…' : t('sharedVocab.reject')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Approved shared groups grid */}
          {sharedGroups.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {sharedGroups.slice(0, 4).map((sg) => (
                <div
                  key={sg.id}
                  className="relative bg-white dark:bg-white/[0.05] dark:backdrop-blur-sm rounded-xl border border-gray-200 dark:border-white/[0.14] shadow-sm dark:shadow-[0_2px_12px_rgba(0,0,0,0.55)] p-3 text-left hover:shadow-lg dark:hover:shadow-[0_4px_20px_rgba(255,255,255,0.04)] hover:-translate-y-0.5 transition-all cursor-pointer"
                  onClick={() => navigate(`/shared-vocab/${sg.id}`, { state: { group: sg } })}
                >
                  {isAdmin && (
                    <button
                      onClick={(e) => handleDeleteSharedGroup(e, sg.id)}
                      disabled={adminActionLoading === sg.id}
                      className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 hover:bg-red-200 dark:hover:bg-red-800/40 disabled:opacity-40 transition-colors"
                      aria-label={t('sharedVocab.delete', 'Delete')}
                    >
                      {adminActionLoading === sg.id ? (
                        <span className="text-[8px]">…</span>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">
                      {sg.language}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {t('userVocab.wordCount', { count: sg.wordCount })}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 line-clamp-1">{sg.name}</p>
                  <p className="text-[10px] text-blue-400 dark:text-blue-500 mt-0.5 truncate">
                    {t('sharedVocab.sharedBy', { name: sg.sharerDisplayName })}
                  </p>
                  {sg.tags && (
                    <div className="flex gap-1 mt-1.5 overflow-x-auto scrollbar-hide">
                      {sg.tags.split(',').map((s) => s.trim()).filter(Boolean).map((tag) => (
                        <span key={tag} className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6 bg-white dark:bg-white/[0.05] dark:backdrop-blur-sm rounded-xl border border-gray-200 dark:border-white/[0.14]">
              {t('sharedVocab.noSharedGroups')}
            </p>
          )}
        </section>

        {allSections.map(({ key, list }) => (
          <WordSection
            key={key}
            sectionKey={key}
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
      {showSharedVocabOnboarding && (() => {
        const raw = t('onboarding.sharedVocab', { returnObjects: true });
        if (!Array.isArray(raw)) return null;
        const steps = (raw as any[]).map((s: any) => ({ icon: s.icon, iconBg: 'bg-green-50 dark:bg-green-900/20', title: s.title, body: s.body }));
        const dismiss = () => { localStorage.setItem(SHARED_VOCAB_ONBOARDING_KEY, '1'); setShowSharedVocabOnboarding(false); };
        return <OnboardingModal steps={steps} onDone={dismiss} onSkip={dismiss} />;
      })()}
    </div>
  );
};

export default HomePage;
