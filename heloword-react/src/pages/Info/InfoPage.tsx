import React from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { environment } from '../../config/environment';

const InfoPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="About" />

      <main className="flex-1 pb-20 px-4 pt-6 max-w-2xl mx-auto w-full">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-4 shadow-sm text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl mx-auto mb-3 flex items-center justify-center shadow-md">
            <span className="text-white text-2xl font-black">Hw</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Heloword</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('info.version', { version: environment.appVersion })}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 leading-relaxed">
            {t('info.description')}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 mb-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('info.developer')}</h3>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center">
              <span className="text-blue-500 font-bold text-lg">RT</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Ryan Tseng</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('info.developerRole')}</p>
            </div>
            <a
              href="https://www.linkedin.com/in/ryan-tseng"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              LinkedIn
            </a>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 mb-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{t('info.howItWorks')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
            {t('info.howItWorksText')}
          </p>
          <a
            href="https://en.wikipedia.org/wiki/Forgetting_curve"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline"
          >
            {t('info.forgettingCurveLink')}
          </a>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('info.features')}</h3>
          <ul className="space-y-2">
            {(['feature1', 'feature2', 'feature3', 'feature4', 'feature5', 'feature6'] as const).map((key) => (
              <li key={key} className="text-sm text-gray-600 dark:text-gray-400">
                {t(`info.${key}`)}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
};

export default InfoPage;
