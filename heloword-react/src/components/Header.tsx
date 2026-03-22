import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSocial } from '../contexts/SocialContext';
import { LANGUAGES, changeLanguage, Language } from '../i18n';
import { doPut } from '../services/api.service';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightContent?: React.ReactNode;
}

const MAX_NICK = 20;

const Header: React.FC<HeaderProps> = ({ title, showBack = false, rightContent }) => {
  const navigate = useNavigate();
  const { user, isLoggedIn, logout, updateUser } = useAuth();
  const { isDark, toggle } = useTheme();
  const { i18n, t } = useTranslation();
  const { myDisplayName, setGuestName } = useSocial();

  const currentLang = i18n.language as Language;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openEdit = () => {
    // Pre-fill: for guest strip "Guest-" prefix; for logged-in use nickname
    const current = isLoggedIn
      ? (user.nickname || user.fullname || '')
      : myDisplayName.replace(/^Guest-/, '');
    setDraft(current);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (isLoggedIn) {
        const res = await doPut('/frontend-api/api/fe/user/nickname', { nickname: trimmed });
        if (res.code === '0000') {
          updateUser({ ...user, nickname: trimmed });
        }
      } else {
        setGuestName(`Guest-${trimmed}`);
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  };

  // What to show in the top-left chip
  const displayLabel = isLoggedIn
    ? (user.nickname || user.fullname || 'Hw')
    : myDisplayName || 'Hw';

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto">
          {/* Left: back button or display name chip */}
          <div className="flex items-center gap-2 min-w-[40px]">
            {showBack ? (
              <button
                onClick={() => navigate(-1)}
                className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
                aria-label={t('common.back', 'Go back')}
              >
                <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            ) : (
              <button
                onClick={openEdit}
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors group max-w-[120px]"
                title={t('common.editNickname', 'Change nickname')}
              >
                <span className="text-blue-500 font-bold text-sm truncate">{displayLabel}</span>
                <svg className="w-3 h-3 text-gray-400 group-hover:text-blue-400 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z" />
                </svg>
              </button>
            )}
          </div>

          {/* Center: title */}
          <h1 className="text-base font-semibold text-gray-800 dark:text-gray-100 truncate px-2">{title}</h1>

          {/* Right: language switcher + dark mode + user */}
          <div className="flex items-center gap-1 min-w-[40px] justify-end">
            {/* Language switcher */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 mr-1">
              {LANGUAGES.map(({ code, label }) => (
                <button
                  key={code}
                  onClick={() => changeLanguage(code)}
                  className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-md transition-colors ${
                    currentLang === code
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={toggle}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={t('common.toggleDark', 'Toggle dark mode')}
            >
              {isDark ? (
                <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>

            {rightContent ?? (
              isLoggedIn ? (
                <div className="flex items-center gap-2">
                  {user.picture && (
                    <img
                      src={user.picture}
                      alt={user.nickname || user.fullname}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  )}
                  <button
                    onClick={logout}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    {t('common.logout')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="text-xs text-blue-500 font-medium hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  {t('common.login')}
                </button>
              )
            )}
          </div>
        </div>
      </header>

      {/* Nickname edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-safe" onClick={() => setEditing(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">
              {t('common.editNickname', 'Change nickname')}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {isLoggedIn
                ? t('common.editNicknameHint', 'This name is visible to other users.')
                : t('common.editNicknameHintGuest', 'You\'ll appear as Guest-{name} to others.').replace('{name}', draft.trim() || '…')}
            </p>

            <div className="relative mb-4">
              {!isLoggedIn && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-blue-500 select-none pointer-events-none">
                  Guest-
                </span>
              )}
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/\s/g, '').slice(0, MAX_NICK))}
                onKeyDown={handleKeyDown}
                placeholder={isLoggedIn ? t('common.nicknamePlaceholder', 'Your nickname…') : t('guestSetup.placeholder')}
                className={`w-full ${!isLoggedIn ? 'pl-[4.5rem]' : 'pl-3'} pr-3 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>

            <button
              onClick={handleSave}
              disabled={!draft.trim() || saving}
              className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors duration-150 mb-2"
            >
              {saving ? '…' : t('social.save')}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="w-full text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 py-2 transition-colors"
            >
              {t('social.cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
