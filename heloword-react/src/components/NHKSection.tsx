import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchNHKArticles, NHKArticle } from '../services/nhkArticle.service';

const NHKSection: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [articles, setArticles] = React.useState<NHKArticle[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchNHKArticles()
      .then((data) => setArticles(data.slice(0, 3)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && articles.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{t('home.nhkTitle')}</h2>
        </div>
        <button
          onClick={() => navigate('/nhk-articles')}
          className="text-xs text-blue-500 font-medium hover:text-blue-700 dark:hover:text-blue-300"
        >
          {t('home.viewAll')}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {articles.map((article) => (
            <button
              key={article.id}
              onClick={() => navigate(`/nhk-articles/${article.id}`)}
              className="w-full text-left flex items-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:shadow-md hover:-translate-y-0.5 transition-all group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
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
      )}
    </section>
  );
};

export default NHKSection;
