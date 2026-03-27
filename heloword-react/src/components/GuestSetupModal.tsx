import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSocial } from '../contexts/SocialContext';
import { changeLanguage, Language, LANGUAGES } from '../i18n';

const MAX_LENGTH = 16;

const GuestSetupModal: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { isLoggedIn, hasCheckedLoginStatus } = useAuth();
  const { setGuestName } = useSocial();

  const [visible, setVisible] = useState(false);
  const [nickname, setNickname] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasCheckedLoginStatus || isLoggedIn) return;
    if (!localStorage.getItem('hw-guest-name')) {
      setVisible(true);
    }
  }, [hasCheckedLoginStatus, isLoggedIn]);

  useEffect(() => {
    if (visible) {
      // Small delay so the modal is rendered before focusing
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  if (!visible) return null;

  const trimmed = nickname.trim();
  const displayName = trimmed ? `Guest-${trimmed}` : '';

  const handleConfirm = () => {
    if (!trimmed) return;
    setGuestName(`Guest-${trimmed}`);
    setVisible(false);
  };

  const handleSkip = () => {
    // Generate a random short id like the default behavior
    const existing = localStorage.getItem('hw-guest-id') || '';
    const shortId = existing.replace(/-/g, '').slice(-4).toUpperCase() || Math.random().toString(36).slice(-4).toUpperCase();
    setGuestName(`Guest-${shortId}`);
    setVisible(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') handleSkip();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-safe">
      <div className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center mb-1">
          {t('guestSetup.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">
          {t('guestSetup.subtitle')}
        </p>

        {/* Language selection */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide text-center mb-2">
            {t('guestSetup.languageLabel')}
          </p>
          <div className="flex gap-2 justify-center">
            {LANGUAGES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => changeLanguage(code as Language)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  i18n.language === code
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="relative mb-2">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-blue-500 select-none pointer-events-none">
            Guest-
          </span>
          <input
            ref={inputRef}
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.replace(/\s/g, '').slice(0, MAX_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder={t('guestSetup.placeholder')}
            className="w-full pl-[4.5rem] pr-3 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Preview */}
        {displayName && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-4">
            {t('guestSetup.preview')} <span className="font-semibold text-blue-500">{displayName}</span>
          </p>
        )}
        {!displayName && <div className="mb-4" />}

        {/* Buttons */}
        <button
          onClick={handleConfirm}
          disabled={!trimmed}
          className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors duration-150 mb-2"
        >
          {t('guestSetup.confirm')}
        </button>
        <button
          onClick={handleSkip}
          className="w-full text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 py-2 transition-colors"
        >
          {t('guestSetup.skip')}
        </button>
      </div>
    </div>
  );
};

export default GuestSetupModal;
