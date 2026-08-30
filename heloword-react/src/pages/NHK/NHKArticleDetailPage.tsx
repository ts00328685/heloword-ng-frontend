import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { fetchNHKArticleById, NHKArticleDetail, NHKParagraph } from '../../services/nhkArticle.service';
import { LangKey, ParagraphCard, useArticleSpeech } from './ArticleShared';
import { trackContentView } from '../../services/analytics.service';

function buildParagraphsFromContent(article: NHKArticleDetail): NHKParagraph[] {
  const jaParas = article.contentJa?.split('\n\n').filter(Boolean) ?? [];
  const enParas = article.contentEn?.split('\n\n').filter(Boolean) ?? [];
  const zhParas = article.contentZh?.split('\n\n').filter(Boolean) ?? [];
  const grammarBlocks = article.contentGrammar?.split('\n\n').filter(Boolean) ?? [];
  if (jaParas.length === 0) return [];
  const allVocab = article.contentVocabulary ?? [];
  const n = jaParas.length;
  return jaParas.map((ja, i) => ({
    original: ja,
    ja,
    en: enParas[i] ?? '',
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
  { key: 'en', label: 'EN' },
  { key: 'ja', label: '日文' },
];

const NHKArticleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [article, setArticle] = useState<NHKArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeLang, setActiveLang] = useState<LangKey>('zh');

  useEffect(() => {
    if (!id) return;
    fetchNHKArticleById(id)
      .then((data) => {
        if (!data) setError(true);
        else {
          setArticle(data);
          trackContentView('nhk_article', data.title);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const paragraphs = useMemo(() => {
    const stored = (article?.paragraphs ?? []).filter(Boolean);
    if (stored.length > 0) return stored;
    if (article) return buildParagraphsFromContent(article);
    return [];
  }, [article]);

  const { speakingKey, speakingMode, spokenRange, triggerSpeak } = useArticleSpeech({ paragraphs, activeLang });

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title={t('nhk.title')} showBack />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        {loading && (
          <div className="space-y-4 mt-2">
            <div className="h-7 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-1/3" />
            <div className="flex gap-2 mt-4">
              {[0, 1, 2, 3].map((i) => (
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
              onClick={() => navigate('/nhk-articles')}
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
                <span>🇯🇵 日文原文</span>
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
                    speakingMode={speakingMode}
                    spokenRange={spokenRange}
                    onSpeak={triggerSpeak}
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

export default NHKArticleDetailPage;
