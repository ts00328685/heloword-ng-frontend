import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import QuizSettingModal from '../../components/QuizSettingModal';

const VocabularyPage: React.FC = () => {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
      <Header title="Vocabulary" />

      <main className="flex-1 pb-20 px-4 pt-8 max-w-2xl mx-auto w-full flex flex-col items-center">

        {/* ── Quiz card ── */}
        <div className="relative w-full max-w-sm vocab-card bg-surface rounded-2xl border border-line p-8 text-center">

          {/* Floating background orbs */}
          <div className="absolute w-28 h-28 rounded-full bg-accent-soft blur-2xl -top-6 -right-6 pointer-events-none animate-float-orb" style={{ animationDelay: '0s' }} />
          <div className="absolute w-20 h-20 rounded-full bg-accent-soft blur-2xl bottom-6 -left-6 pointer-events-none animate-float-orb" style={{ animationDelay: '2.5s' }} />
          <div className="absolute w-12 h-12 rounded-full bg-accent-soft blur-xl bottom-14 right-4 pointer-events-none animate-float-orb" style={{ animationDelay: '1.2s' }} />

          <div className="vocab-card-body">
            {/* Floating icon */}
            <div className="w-16 h-16 mx-auto mb-4 bg-ink rounded-2xl flex items-center justify-center shadow-md animate-float">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>

            <h2 className="text-lg font-semibold text-ink mb-2">{t('home.quizTitle')}</h2>
            <p className="text-sm text-ink-muted mb-6">{t('home.quizSubtitle')}</p>

            <button
              onClick={() => setShowModal(true)}
              className="btn-gradient w-full text-white font-semibold py-4 rounded-2xl transition-all shadow-lg active:scale-[0.98]"
            >
              {t('home.goToQuiz')}
            </button>
          </div>
        </div>

        <p className="text-xs text-ink-faint mt-6 text-center leading-relaxed px-4">
          {t('vocabulary.hint')}
        </p>

        {/* ── Ebbinghaus card ── */}
        <div className="relative mt-6 w-full max-w-sm vocab-card bg-surface border border-line rounded-2xl p-4">

          {/* Floating background orbs */}
          <div className="absolute w-24 h-24 rounded-full bg-accent-soft blur-2xl -top-4 -right-4 pointer-events-none animate-float-orb" style={{ animationDelay: '1s' }} />
          <div className="absolute w-16 h-16 rounded-full bg-accent-soft blur-xl bottom-2 -left-4 pointer-events-none animate-float-orb" style={{ animationDelay: '3s' }} />

          <div className="vocab-card-body">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold text-accent">{t('vocabulary.ebbinghausTitle')}</h3>
            </div>
            <p className="text-xs text-accent leading-relaxed">
              {t('vocabulary.ebbinghausText')}
            </p>
            <p className="text-xs text-accent font-semibold mt-2">
              {t('vocabulary.recommendedGroupSize')}
            </p>
            <p className="text-xs text-danger font-semibold mt-2">
              {t('vocabulary.repetitionTrial')}
            </p>
          </div>
        </div>

      </main>

      {showModal && <QuizSettingModal onClose={() => setShowModal(false)} />}
    </div>
  );
};

export default VocabularyPage;
