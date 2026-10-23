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
      .then((data) => setArticles(data.filter((a) => a.sourceLang === 'ja')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
      <Header title={t('nhk.title')} showBack />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="space-y-2 mt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 bg-ink/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-ink-faint text-sm">{t('nhk.noArticles')}</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-ink-faint mb-3">
              {t('nhk.articleCount', { count: articles.length })}
            </p>
            <div className="space-y-2">
              {articles.map((article, idx) => (
                <button
                  key={article.id}
                  onClick={() => navigate(`/nhk-articles/${article.id}`)}
                  className="relative overflow-hidden w-full text-left flex items-center gap-3 bg-surface dark:backdrop-blur-sm border border-line rounded-xl px-4 py-3.5 hover:shadow-md dark:hover:shadow-[0_4px_20px_rgba(255,255,255,0.04)] transition-all group"
                >
                  <span className="text-xs text-ink-faint font-mono w-6 text-right shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink leading-snug group-hover:text-accent transition-colors">
                      {article.title}
                    </p>
                    <p className="text-xs text-ink-faint mt-0.5">
                      {new Date(article.createDate).toLocaleDateString('zh-TW')}
                    </p>
                  </div>
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-ink translate-y-full group-hover:translate-y-0 transition-transform duration-200" />
                  <svg
                    className="w-4 h-4 text-ink-faint shrink-0 group-hover:text-accent transition-colors"
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
