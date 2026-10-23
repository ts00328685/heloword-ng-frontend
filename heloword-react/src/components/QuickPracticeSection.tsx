import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { GridCell, GridPanel, Meta, SectionHeader } from './ui';

interface QuickGame {
  /** Stable analytics id — never the (translated) button text. */
  id: string;
  path: string;
  state: Record<string, string>;
  lang: 'en' | 'jp';
  kind: 'speaking' | 'scramble';
}

/** Columns are languages (EN | JP), rows are game types (speaking, scramble). */
const GAMES: QuickGame[] = [
  { id: 'home.quick.en_speaking', path: '/challenge/speaking', state: {}, lang: 'en', kind: 'speaking' },
  { id: 'home.quick.jp_speaking', path: '/challenge/speaking-jp', state: {}, lang: 'jp', kind: 'speaking' },
  { id: 'home.quick.en_scramble', path: '/challenge/scramble', state: { lang: 'en' }, lang: 'en', kind: 'scramble' },
  { id: 'home.quick.jp_scramble', path: '/challenge/scramble', state: { lang: 'jp' }, lang: 'jp', kind: 'scramble' },
];

const KIND_ICON: Record<QuickGame['kind'], React.ReactNode> = {
  speaking: <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />,
  scramble: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h10.5m-10.5 5.25h16.5" />,
};

/** Home: four one-tap shortcuts into the English / Japanese speaking and sentence-scramble games. */
const QuickPracticeSection: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="mb-10">
      <SectionHeader
        title={t('home.quick.title')}
        subtitle={t('home.quick.subtitle')}
        action={{ label: t('home.quick.allGames'), onClick: () => navigate('/challenge'), analytics: 'home.quick.all_games' }}
      />

      <GridPanel>
        {GAMES.map((g) => (
          <GridCell key={g.id} onClick={() => navigate(g.path, { state: g.state })} analytics={g.id} className="group">
            <div className="flex items-center justify-between">
              <Meta>{t(`home.quick.${g.lang}`)}</Meta>
              <svg className="w-4 h-4 text-ink-faint group-hover:text-accent transition-colors" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
                {KIND_ICON[g.kind]}
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-ink leading-tight">{t(`home.quick.${g.kind}`)}</p>
            <p className="mt-1 text-[11px] text-ink-muted leading-snug line-clamp-2">
              {t(`home.quick.${g.kind}Desc`)}
            </p>
          </GridCell>
        ))}
      </GridPanel>
    </section>
  );
};

export default QuickPracticeSection;
