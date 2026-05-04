import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import QuizSettingModal from '../../components/QuizSettingModal';

const Sparkle: React.FC<{ className?: string; delay?: number }> = ({ className = '', delay = 0 }) => (
  <svg
    className={className}
    style={{ animationDelay: `${delay}s` }}
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" />
  </svg>
);

const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.38) 50%, transparent 70%)',
  animation: 'shimmer-sweep 3.5s ease-in-out infinite',
};

const VocabularyPage: React.FC = () => {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title="Vocabulary" />

      <main className="flex-1 pb-20 px-4 pt-8 max-w-2xl mx-auto w-full flex flex-col items-center">

        {/* ── Quiz card ── */}
        <div className="relative w-full max-w-sm">
          {/* Ambient glow behind card */}
          <div className="absolute inset-0 bg-blue-400/25 dark:bg-blue-500/35 rounded-3xl blur-2xl scale-110 -z-10 animate-pulse" />

          <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl border border-blue-100 dark:border-blue-900/60 p-8 text-center shadow-2xl shadow-blue-200/50 dark:shadow-blue-900/40 overflow-hidden">

            {/* Shimmer sweep */}
            <div className="absolute inset-0 pointer-events-none" style={shimmerStyle} />

            {/* Sparkle accents */}
            <Sparkle className="absolute top-3 right-5 w-3 h-3 text-yellow-300 dark:text-yellow-400 animate-pulse" delay={0} />
            <Sparkle className="absolute top-10 right-3 w-2 h-2 text-blue-300 dark:text-blue-400 animate-pulse" delay={0.8} />
            <Sparkle className="absolute top-4 left-5 w-2 h-2 text-pink-300 dark:text-pink-400 animate-pulse" delay={0.4} />
            <Sparkle className="absolute bottom-12 left-3 w-1.5 h-1.5 text-purple-300 dark:text-purple-400 animate-pulse" delay={1.3} />
            <Sparkle className="absolute bottom-6 right-4 w-1.5 h-1.5 text-indigo-300 dark:text-indigo-400 animate-pulse" delay={0.6} />

            {/* Floating icon with glow ring */}
            <div className="relative w-16 h-16 mx-auto mb-4 animate-float">
              <div className="absolute inset-0 bg-blue-400/40 dark:bg-blue-500/50 rounded-2xl blur-md animate-pulse" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-700 dark:from-blue-500 dark:to-blue-800 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/50">
                <svg className="w-8 h-8 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>

            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t('home.quizTitle')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('home.quizSubtitle')}</p>

            {/* Button with shimmer */}
            <button
              onClick={() => setShowModal(true)}
              className="relative w-full overflow-hidden bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:from-blue-700 active:to-blue-800 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/40 hover:shadow-blue-500/60 hover:-translate-y-0.5"
            >
              <span className="relative z-10">{t('home.goToQuiz')}</span>
              <span
                className="absolute inset-0 pointer-events-none"
                style={{ ...shimmerStyle, animationDelay: '0.8s' }}
              />
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center leading-relaxed px-4">
          {t('vocabulary.hint')}
        </p>

        {/* ── Ebbinghaus card ── */}
        <div className="relative mt-6 w-full max-w-sm">
          {/* Ambient glow */}
          <div className="absolute inset-0 bg-purple-400/20 dark:bg-purple-500/30 rounded-3xl blur-2xl scale-110 -z-10" />

          <div className="relative bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-purple-900/30 dark:via-blue-900/20 dark:to-indigo-900/30 border border-purple-200/80 dark:border-purple-700/50 rounded-2xl p-4 shadow-lg shadow-purple-200/40 dark:shadow-purple-900/30 overflow-hidden">

            {/* Shimmer sweep */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ ...shimmerStyle, animationDelay: '2s', animationDuration: '5s' }}
            />

            {/* Sparkle accents */}
            <Sparkle className="absolute top-3 right-5 w-2.5 h-2.5 text-purple-300 dark:text-purple-500 animate-pulse" delay={0.3} />
            <Sparkle className="absolute bottom-4 right-4 w-1.5 h-1.5 text-blue-300 dark:text-blue-500 animate-pulse" delay={1.1} />
            <Sparkle className="absolute bottom-3 left-4 w-2 h-2 text-indigo-300 dark:text-indigo-500 animate-pulse" delay={0.7} />

            <div className="flex items-center gap-2 mb-2">
              <div className="relative shrink-0">
                <div className="absolute inset-0 bg-purple-400/30 rounded-full blur-sm animate-pulse" />
                <span className="relative text-lg">🧠</span>
              </div>
              <h3 className="text-sm font-bold text-purple-700 dark:text-purple-300">{t('vocabulary.ebbinghausTitle')}</h3>
            </div>
            <p className="text-xs text-purple-600 dark:text-purple-400 leading-relaxed">
              {t('vocabulary.ebbinghausText')}
            </p>
            <p className="text-xs text-purple-500 dark:text-purple-500 font-semibold mt-2">
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
