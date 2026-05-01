import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { fetchNHKArticles, NHKArticle } from '../../services/nhkArticle.service';

const NHKArticleListPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [articles, setArticles] = useState<NHKArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNHKArticles()
      .then(setArticles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title={t('nhk.title')} showBack />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="space-y-2 mt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📰</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">{t('nhk.noArticles')}</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              {t('nhk.articleCount', { count: articles.length })}
            </p>
            <div className="space-y-2">
              {articles.map((article, idx) => (
                <button
                  key={article.id}
                  onClick={() => navigate(`/nhk-articles/${article.id}`)}
                  className="w-full text-left flex items-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all group"
                >
                  <span className="text-xs text-gray-300 dark:text-gray-600 font-mono w-6 text-right shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {article.title}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {new Date(article.createDate).toLocaleDateString('zh-TW')}
                    </p>
                  </div>
                  <svg
                    className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 group-hover:text-blue-400 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default NHKArticleListPage;
