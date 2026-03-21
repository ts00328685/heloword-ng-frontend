import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '../contexts/UIContext';

const LoadingSpinner: React.FC = () => {
  const { loading } = useUI();
  const { t } = useTranslation();

  if (!loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 flex flex-col items-center gap-3 shadow-xl">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">{t('common.loading')}</span>
      </div>
    </div>
  );
};

export default LoadingSpinner;
