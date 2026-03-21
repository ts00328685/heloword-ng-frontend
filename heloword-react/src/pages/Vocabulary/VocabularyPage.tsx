import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import QuizSettingModal from '../../components/QuizSettingModal';

const VocabularyPage: React.FC = () => {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Vocabulary" />

      <main className="flex-1 pb-20 px-4 pt-8 max-w-2xl mx-auto w-full flex flex-col items-center">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center shadow-sm w-full max-w-sm">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/50 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>

          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t('vocabulary.startQuiz')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {t('vocabulary.description')}
          </p>

          <button
            onClick={() => setShowModal(true)}
            className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-colors shadow-md text-base"
          >
            {t('vocabulary.configureBtn')}
          </button>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center leading-relaxed px-4">
          {t('vocabulary.hint')}
        </p>
      </main>

      {showModal && <QuizSettingModal onClose={() => setShowModal(false)} />}
    </div>
  );
};

export default VocabularyPage;
