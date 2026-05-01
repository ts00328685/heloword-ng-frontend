import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { fetchNHKArticleById, NHKArticleDetail, NHKParagraph, NHKVocabItem } from '../../services/nhkArticle.service';

type LangKey = 'original' | 'zh' | 'en' | 'ja';

const LANG_TABS: { key: LangKey; label: string }[] = [
  { key: 'original', label: '原文' },
  { key: 'zh', label: '繁中' },
  { key: 'en', label: 'EN' },
  { key: 'ja', label: '日文' },
];

const ParagraphCard: React.FC<{ paragraph: NHKParagraph; activeLang: LangKey; index: number }> = ({
  paragraph,
  activeLang,
  index,
}) => {
  const translation = activeLang === 'original' ? null : paragraph[activeLang];

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <p className="text-xs text-gray-300 dark:text-gray-600 font-mono mb-2">#{index + 1}</p>
      <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{paragraph.original}</p>
      {translation && (
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          {translation || <span className="italic text-gray-300 dark:text-gray-600">—</span>}
        </p>
      )}
    </div>
  );
};

const VocabTable: React.FC<{ items: NHKVocabItem[] }> = ({ items }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!items || items.length === 0) return null;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        <span>📚 {t('nhk.vocabulary')} ({items.length})</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                <th className="text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium">{t('nhk.word')}</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium">{t('nhk.reading')}</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium">中文</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium">English</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v, i) => (
                <tr
                  key={i}
                  className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium text-amber-600 dark:text-amber-400">{v.word}</td>
                  <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500 font-mono text-xs">{v.reading}</td>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-200">{v.meaning_zh}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{v.meaning_en}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const GrammarSection: React.FC<{ grammar: string }> = ({ grammar }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!grammar) return null;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        <span>📝 {t('nhk.grammar')}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{grammar}</p>
        </div>
      )}
    </div>
  );
};

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
        else setArticle(data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const paragraphs = article?.paragraphs ?? [];
  const vocabulary = Array.isArray(article?.contentVocabulary) ? article.contentVocabulary : [];

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
            {/* Article title & meta */}
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

            {/* Language tabs */}
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

            {/* Paragraphs */}
            <div className="space-y-3 mb-5">
              {paragraphs.length > 0 ? (
                paragraphs.map((p, i) => (
                  <ParagraphCard key={i} paragraph={p} activeLang={activeLang} index={i} />
                ))
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  {t('nhk.noParagraphs')}
                </p>
              )}
            </div>

            {/* Grammar & Vocabulary */}
            <div className="space-y-3">
              <GrammarSection grammar={article.contentGrammar} />
              <VocabTable items={vocabulary} />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default NHKArticleDetailPage;
