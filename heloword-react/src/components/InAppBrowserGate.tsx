import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  isInAppBrowser,
  isLineWebview,
  getLineExternalUrl,
  lineRedirectAlreadySent,
} from '../utils/inAppBrowser';

const HELOWORD_URL = 'https://heloword.com';

const InAppBrowserGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isLineWebview && !lineRedirectAlreadySent()) {
      window.location.href = getLineExternalUrl();
    }
  }, []);

  if (!isInAppBrowser) return <>{children}</>;

  // LINE: redirect in progress — show spinner while LINE hands off to system browser
  if (isLineWebview && !lineRedirectAlreadySent()) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400">{t('inAppBrowser.opening')}</span>
        </div>
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(HELOWORD_URL);
    } catch {
      // Fallback for browsers that block clipboard API
      const el = document.createElement('textarea');
      el.value = HELOWORD_URL;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 px-6">
      <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-3xl mb-6 flex items-center justify-center shadow-lg">
        <span className="text-white text-3xl font-black">Hw</span>
      </div>

      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">
        {t('inAppBrowser.title')}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8 leading-relaxed max-w-xs">
        {t('inAppBrowser.subtitle')}
      </p>

      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-5">
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{t('inAppBrowser.copyLabel')}</p>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 truncate select-all">
            {HELOWORD_URL}
          </span>
          <button
            onClick={handleCopy}
            className="shrink-0 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {copied ? t('inAppBrowser.copied') : t('inAppBrowser.copy')}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-xs leading-relaxed">
        {t('inAppBrowser.instruction')}
      </p>
    </div>
  );
};

export default InAppBrowserGate;
