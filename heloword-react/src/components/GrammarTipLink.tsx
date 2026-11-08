import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GrammarLang, grammarPath } from '../pages/Grammar/grammarPath';

/**
 * Tiny "快速文法" link shown beside grammar explanations (AI 文法解析, sentence
 * breakdowns, sentence fixes); opens the page on the matching language tab.
 */
const GrammarTipLink: React.FC<{ lang: GrammarLang; analytics: string; className?: string }> = ({ lang, analytics, className = '' }) => {
  const { t } = useTranslation();
  return (
    <Link
      to={grammarPath(lang)}
      data-analytics={`${analytics}.grammar_link`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-accent transition-colors ${className}`}
    >
      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
      {t('grammar.title')}
    </Link>
  );
};

export default GrammarTipLink;
