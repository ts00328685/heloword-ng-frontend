import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { fetchNHKArticleById, NHKArticleDetail, NHKParagraph } from '../../services/nhkArticle.service';
import { speakSentence, cancelPronouncing } from '../../services/tts.service';
import { LangKey, ParagraphCard } from '../NHK/ArticleShared';

function buildParagraphsFromContent(article: NHKArticleDetail): NHKParagraph[] {
  const enParas = article.contentEn?.split('\n\n').filter(Boolean) ?? [];
  const zhParas = article.contentZh?.split('\n\n').filter(Boolean) ?? [];
  const grammarBlocks = article.contentGrammar?.split('\n\n').filter(Boolean) ?? [];
  if (enParas.length === 0) return [];
  const allVocab = article.contentVocabulary ?? [];
  const n = enParas.length;
  return enParas.map((en, i) => ({
    original: en,
    ja: '',
    en,
    zh: zhParas[i] ?? '',
    grammar: grammarBlocks[i] ?? '',
    vocabulary: allVocab.slice(
      Math.floor((i * allVocab.length) / n),
      Math.floor(((i + 1) * allVocab.length) / n),
    ),
  }));
}

const LANG_TABS: { key: LangKey; label: string }[] = [
  { key: 'original', label: '原文' },
  { key: 'zh', label: '繁中' },
  { key: 'ja', label: '日文' },
];

const ENArticleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [article, setArticle] = useState<NHKArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeLang, setActiveLang] = useState<LangKey>('zh');
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const speakingKeyRef = useRef<string | null>(null);

  useEffect(() => () => { cancelPronouncing(); }, []);

  useEffect(() => {
    cancelPronouncing();
    speakingKeyRef.current = null;
    setSpeakingKey(null);
  }, [activeLang]);

  const triggerSpeak = useCallback((key: string, text: string, langCode: string) => {
    if (speakingKeyRef.current === key) {
      cancelPronouncing();
      speakingKeyRef.current = null;
      setSpeakingKey(null);
      return;
    }
    speakingKeyRef.current = key;
    setSpeakingKey(key);
    cancelPronouncing();
    speakSentence(text, langCode, {}, () => {
      if (speakingKeyRef.current === key) {
        speakingKeyRef.current = null;
        setSpeakingKey(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchNHKArticleById(id)
      .then((data) => {
        if (!data) setError(true);
        else setArticle(data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const paragraphs = useMemo(() => {
    if (!article) return [];
    const stored = (article.paragraphs ?? []).filter(Boolean);
    // For EN articles, prefer stored paragraphs where original is set; fall back to contentEn
    if (stored.length > 0 && (stored[0].original || stored[0].en)) {
      return stored.map((p) => ({ ...p, original: p.original || p.en }));
    }
    return buildParagraphsFromContent(article);
  }, [article]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title={t('enArticle.title')} showBack />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        {loading && (
          <div className="space-y-4 mt-2">
            <div className="h-7 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-1/3" />
            <div className="flex gap-2 mt-4">
              {[0, 1].map((i) => (
                <div key={i} className="h-9 w-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="space-y-3 mt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">😞</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">{t('nhk.loadError')}</p>
            <button
              onClick={() => navigate('/en-articles')}
              className="mt-4 text-sm text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {t('nhk.backToList')}
            </button>
          </div>
        )}

        {article && (
          <>
            <div className="mb-4">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-snug mb-2">
                {article.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                <span>🇬🇧 {t('enArticle.metaLabel')}</span>
                <span>·</span>
                <span>{new Date(article.createDate).toLocaleDateString('zh-TW')}</span>
                {article.sourceUrl && (
                  <>
                    <span>·</span>
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-0.5 hover:text-blue-500 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {t('nhk.source')}
                    </a>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-1.5 mb-4 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
              {LANG_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveLang(key)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeLang === key
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-3 mb-5">
              {paragraphs.length > 0 ? (
                paragraphs.map((p, i) => (
                  <ParagraphCard
                    key={i}
                    paragraph={p}
                    activeLang={activeLang}
                    index={i}
                    speakingKey={speakingKey}
                    onSpeak={triggerSpeak}
                    originalTtsCode="en-US"
                    originalCleanLang="en"
                    vocabTtsCode="en-US"
                  />
                ))
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  {t('nhk.noParagraphs')}
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default ENArticleDetailPage;
