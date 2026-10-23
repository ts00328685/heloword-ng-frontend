import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import QuizSettingModal from '../../components/QuizSettingModal';
import { Button, ChevronRight, Eyebrow } from '../../components/ui';
import { formatInterval, getIntervals } from '../../utils/ebbinghaus';

const VocabularyPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const uiLocale = i18n.language === 'zh' ? 'zh-TW' : i18n.language;
  const [showModal, setShowModal] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  // The user's own schedule (intervals are configurable), not the default text.
  const intervals = getIntervals();

  return (
    <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
      <Header title={t('nav.quiz')} />

      <main className="flex-1 pb-24 px-5 pt-6 max-w-2xl mx-auto w-full">
        {/* One clear action — the setup modal loads the word lists itself. */}
        <section className="mb-10">
          <Eyebrow>{t('vocabulary.startQuiz')}</Eyebrow>
          <h2 className="font-serif text-[26px] leading-snug text-ink mt-3">{t('home.quizTitle')}</h2>
          <p className="text-sm text-ink-muted mt-2 leading-relaxed">{t('vocabulary.description')}</p>
          <Button onClick={() => setShowModal(true)} className="mt-5">
            {t('home.goToQuiz')}
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <p className="text-xs text-ink-faint mt-4">{t('vocabulary.recommendedGroupSize')}</p>
        </section>

        {/* Review schedule at a glance */}
        <section className="mb-8">
          <Eyebrow className="mb-3">{t('vocabulary.ebbinghausTitle')}</Eyebrow>
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs text-ink-muted">
            {intervals.map((ms, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="tabular-nums px-2 py-1 rounded-md border border-line bg-surface">{formatInterval(ms, uiLocale)}</span>
                {i < intervals.length - 1 && <span className="text-ink-faint">→</span>}
              </li>
            ))}
          </ol>
        </section>

        {/* Why it works — collapsed by default */}
        <section className="border-y border-line">
          <button
            onClick={() => setHowOpen((v) => !v)}
            className="w-full flex items-center justify-between py-3.5 text-sm text-ink"
            aria-expanded={howOpen}
          >
            {t('vocabulary.howItWorks')}
            <svg className={`w-4 h-4 text-ink-faint transition-transform ${howOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {howOpen && (
            <div className="pb-5 space-y-3 animate-slide-down">
              <p className="text-sm text-ink-muted leading-relaxed whitespace-pre-line">{t('vocabulary.ebbinghausText')}</p>
              <p className="text-sm text-ink leading-relaxed border-l-2 border-accent pl-3">{t('vocabulary.repetitionTrial')}</p>
            </div>
          )}
        </section>
      </main>

      {showModal && <QuizSettingModal onClose={() => setShowModal(false)} />}
    </div>
  );
};

export default VocabularyPage;
