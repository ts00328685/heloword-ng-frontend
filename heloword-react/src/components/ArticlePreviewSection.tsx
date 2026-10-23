import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SectionHeader } from './ui';
import { fetchNHKArticles, NHKArticle } from '../services/nhkArticle.service';

interface Props {
  sourceLang: string;
  title: string;
  listRoute: string;
  detailRoutePrefix: string;
  viewAllLabel: string;
  /** Rendered beside the title (e.g. language tabs). Also keeps the section visible when empty. */
  extra?: React.ReactNode;
}

const ArticlePreviewSection: React.FC<Props> = ({
  sourceLang,
  title,
  listRoute,
  detailRoutePrefix,
  viewAllLabel,
  extra,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [articles, setArticles] = React.useState<NHKArticle[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchNHKArticles()
      .then((data) => setArticles(data.filter((a) => a.sourceLang === sourceLang).slice(0, 3)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sourceLang]);

  if (!loading && articles.length === 0 && !extra) return null;

  return (
    <section className="mb-10">
      <SectionHeader title={title} extra={extra} action={{ label: viewAllLabel, onClick: () => navigate(listRoute) }} />

      {loading ? (
        <div className="border-y border-line divide-y divide-line">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[52px] flex items-center">
              <div className="h-3 w-2/3 bg-line rounded-sm animate-pulse" />
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <p className="text-xs text-ink-faint text-center py-8 border-y border-line">{t('home.noArticles')}</p>
      ) : (
        <ul className="border-y border-line divide-y divide-line">
          {articles.map((article) => (
            <li key={article.id}>
              <button
                onClick={() => navigate(`${detailRoutePrefix}/${article.id}`)}
                className="w-full text-left flex items-baseline gap-4 py-3.5 group"
              >
                <time className="shrink-0 w-[4.5rem] text-[11px] tabular-nums text-ink-faint">
                  {new Date(article.createDate).toLocaleDateString('zh-TW')}
                </time>
                <p className="flex-1 min-w-0 text-sm text-ink truncate group-hover:text-accent transition-colors">
                  {article.title}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ArticlePreviewSection;
