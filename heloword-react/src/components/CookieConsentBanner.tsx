import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const COOKIE_KEY = 'hw-cookie-consent';

const CookieConsentBanner: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(COOKIE_KEY)) {
      // Delay so it doesn't clash with the guest nickname modal
      const id = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(id);
    }
  }, []);

  if (!visible) return null;

  const handleAccept = () => {
    localStorage.setItem(COOKIE_KEY, '1');
    setVisible(false);
  };

  return (
    <div className="fixed bottom-20 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
      <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-lg w-full pointer-events-auto border border-gray-700">
        {/* Cookie icon */}
        <span className="text-xl flex-shrink-0">🍪</span>

        <p className="flex-1 text-xs text-gray-300 leading-relaxed">
          {t('cookie.message')}
        </p>

        <button
          onClick={handleAccept}
          className="flex-shrink-0 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors duration-150"
        >
          {t('cookie.accept')}
        </button>
      </div>
    </div>
  );
};

export default CookieConsentBanner;
