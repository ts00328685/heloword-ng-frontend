import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  isInAppBrowser,
  isLineWebview,
  isInstagramWebview,
  isAndroid,
  canAutoRedirectExternal,
  getLineExternalUrl,
  getAndroidIntentUrl,
  externalRedirectAlreadySent,
} from '../utils/inAppBrowser';

const HELOWORD_URL = 'https://heloword.com';

const InAppBrowserGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (externalRedirectAlreadySent() || !canAutoRedirectExternal) return;
    // LINE honours ?openExternalBrowser=1; Instagram on Android needs an intent:// URL.
    // (iOS Instagram has no programmatic escape — it falls through to the manual gate.)
    if (isLineWebview) {
      window.location.href = getLineExternalUrl();
    } else if (isInstagramWebview && isAndroid) {
      window.location.href = getAndroidIntentUrl();
    }
  }, []);

  if (!isInAppBrowser) return <>{children}</>;

  // Redirect in progress — show spinner while the in-app browser hands off to the system browser
  if (canAutoRedirectExternal && !externalRedirectAlreadySent()) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-paper">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-ink-muted">{t('inAppBrowser.opening')}</span>
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
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-paper px-6">
      <div className="w-20 h-20 rounded-3xl mb-6 overflow-hidden shadow-lg">
        <img src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="Heloword" className="w-full h-full object-contain" />
      </div>

      <h1 className="text-xl font-semibold text-ink mb-2 text-center">
        {t('inAppBrowser.title')}
      </h1>
      <p className="text-sm text-ink-muted text-center mb-8 leading-relaxed max-w-xs">
        {t('inAppBrowser.subtitle')}
      </p>

      <div className="w-full max-w-sm bg-surface rounded-2xl border border-line p-4 mb-5">
        <p className="text-xs text-ink-faint mb-2">{t('inAppBrowser.copyLabel')}</p>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm font-mono text-ink bg-paper rounded-lg px-3 py-2 truncate select-all">
            {HELOWORD_URL}
          </span>
          <button
            onClick={handleCopy}
            className="shrink-0 bg-ink hover:bg-ink/85 active:bg-ink/85 text-paper text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {copied ? t('inAppBrowser.copied') : t('inAppBrowser.copy')}
          </button>
        </div>
      </div>

      <p className="text-xs text-ink-faint text-center max-w-xs leading-relaxed">
        {t('inAppBrowser.instruction')}
      </p>
    </div>
  );
};

export default InAppBrowserGate;
