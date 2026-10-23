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
    <div className="fixed bottom-20 left-0 right-0 z-[45] flex justify-center px-4 pointer-events-none">
      <div className="bg-ink text-paper rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-lg w-full pointer-events-auto border border-ink">
        {/* Cookie icon */}

        <p className="flex-1 text-xs text-ink-faint leading-relaxed">
          {t('cookie.message')}
        </p>

        <button
          onClick={handleAccept}
          className="flex-shrink-0 bg-ink hover:bg-ink/85 active:bg-ink/85 text-paper text-xs font-semibold px-4 py-2 rounded-xl transition-colors duration-150"
        >
          {t('cookie.accept')}
        </button>
      </div>
    </div>
  );
};

export default CookieConsentBanner;
