import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

interface QuickGame {
  /** Stable analytics id — never the (translated) button text. */
  id: string;
  path: string;
  state: Record<string, string>;
  lang: 'en' | 'jp';
  kind: 'speaking' | 'scramble';
  icon: string;
  gradient: string;
}

/** Columns are languages (EN | JP), rows are game types (speaking, scramble). */
const GAMES: QuickGame[] = [
  { id: 'home.quick.en_speaking', path: '/challenge/speaking', state: {}, lang: 'en', kind: 'speaking', icon: '🎤',
    gradient: 'from-sky-500 to-indigo-500 dark:from-sky-600 dark:to-indigo-700' },
  { id: 'home.quick.jp_speaking', path: '/challenge/speaking-jp', state: {}, lang: 'jp', kind: 'speaking', icon: '🎙️',
    gradient: 'from-rose-400 to-pink-600 dark:from-rose-500 dark:to-pink-700' },
  { id: 'home.quick.en_scramble', path: '/challenge/scramble', state: { lang: 'en' }, lang: 'en', kind: 'scramble', icon: '🧩',
    gradient: 'from-violet-500 to-indigo-600 dark:from-violet-600 dark:to-indigo-800' },
  { id: 'home.quick.jp_scramble', path: '/challenge/scramble', state: { lang: 'jp' }, lang: 'jp', kind: 'scramble', icon: '🧩',
    gradient: 'from-orange-400 to-rose-500 dark:from-orange-500 dark:to-rose-700' },
];

/** Home: four one-tap shortcuts into the English / Japanese speaking and sentence-scramble games. */
const QuickPracticeSection: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{t('home.quick.title')}</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('home.quick.subtitle')}</p>
        </div>
        <button
          onClick={() => navigate('/challenge')}
          data-analytics="home.quick.all_games"
          className="text-xs text-blue-500 font-medium hover:text-blue-700 dark:hover:text-blue-300"
        >
          {t('home.quick.allGames')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {GAMES.map((g) => (
          <button
            key={g.id}
            onClick={() => navigate(g.path, { state: g.state })}
            data-analytics={g.id}
            className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${g.gradient} p-3.5 text-left text-white shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all`}
          >
            {/* Oversized icon as a soft watermark */}
            <span
              className="pointer-events-none absolute -right-2 -bottom-3 text-6xl opacity-25 group-hover:opacity-35 group-hover:scale-110 transition-all select-none"
              aria-hidden="true"
            >
              {g.icon}
            </span>

            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold tracking-wide backdrop-blur-sm">
              {g.lang === 'en' ? '🇬🇧' : '🇯🇵'} {t(`home.quick.${g.lang}`)}
            </span>
            <p className="relative mt-2 text-sm font-bold leading-tight">{t(`home.quick.${g.kind}`)}</p>
            <p className="relative mt-0.5 text-[11px] text-white/80 leading-snug line-clamp-2">
              {t(`home.quick.${g.kind}Desc`)}
            </p>
            <span className="relative mt-2 inline-flex items-center gap-0.5 text-[11px] font-semibold text-white/90 group-hover:gap-1.5 transition-all">
              {t('home.quick.start')}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default QuickPracticeSection;
