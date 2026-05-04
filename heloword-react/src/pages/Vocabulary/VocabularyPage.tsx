import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import QuizSettingModal from '../../components/QuizSettingModal';

const VocabularyPage: React.FC = () => {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title="Vocabulary" />

      <main className="flex-1 pb-20 px-4 pt-8 max-w-2xl mx-auto w-full flex flex-col items-center">

        {/* ── Quiz card ── */}
        <div className="relative w-full max-w-sm vocab-card bg-white dark:bg-gray-800 rounded-2xl border border-blue-100/60 dark:border-blue-900/40 p-8 text-center">

          {/* Floating background orbs */}
          <div className="absolute w-28 h-28 rounded-full bg-blue-300/20 dark:bg-blue-400/10 blur-2xl -top-6 -right-6 pointer-events-none animate-float-orb" style={{ animationDelay: '0s' }} />
          <div className="absolute w-20 h-20 rounded-full bg-cyan-300/20 dark:bg-cyan-400/10 blur-2xl bottom-6 -left-6 pointer-events-none animate-float-orb" style={{ animationDelay: '2.5s' }} />
          <div className="absolute w-12 h-12 rounded-full bg-sky-300/20 dark:bg-sky-400/10 blur-xl bottom-14 right-4 pointer-events-none animate-float-orb" style={{ animationDelay: '1.2s' }} />

          <div className="vocab-card-body">
            {/* Floating icon */}
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center shadow-md shadow-blue-500/30 animate-float">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t('home.quizTitle')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('home.quizSubtitle')}</p>

            <button
              onClick={() => setShowModal(true)}
              className="btn-gradient w-full text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/35 hover:shadow-blue-500/50 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              {t('home.goToQuiz')}
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center leading-relaxed px-4">
          {t('vocabulary.hint')}
        </p>

        {/* ── Ebbinghaus card ── */}
        <div className="relative mt-6 w-full max-w-sm vocab-card bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-100/80 dark:border-blue-800/40 rounded-2xl p-4">

          {/* Floating background orbs */}
          <div className="absolute w-24 h-24 rounded-full bg-cyan-300/20 dark:bg-cyan-400/10 blur-2xl -top-4 -right-4 pointer-events-none animate-float-orb" style={{ animationDelay: '1s' }} />
          <div className="absolute w-16 h-16 rounded-full bg-blue-300/20 dark:bg-blue-400/10 blur-xl bottom-2 -left-4 pointer-events-none animate-float-orb" style={{ animationDelay: '3s' }} />

          <div className="vocab-card-body">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg animate-float" style={{ animationDelay: '0.5s' }}>🧠</span>
              <h3 className="text-sm font-bold text-blue-700 dark:text-blue-300">{t('vocabulary.ebbinghausTitle')}</h3>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
              {t('vocabulary.ebbinghausText')}
            </p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400 font-semibold mt-2">
              {t('vocabulary.recommendedGroupSize')}
            </p>
            <p className="text-xs text-red-500 dark:text-red-400 font-semibold mt-2">
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
