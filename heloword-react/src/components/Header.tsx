import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSocial } from '../contexts/SocialContext';
import { LANGUAGES, changeLanguage, Language } from '../i18n';
import { doPut } from '../services/api.service';
import { getTTSSettings, setTTSSettings, TTSSettings } from '../services/ttsSettings.service';

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

  const [menuOpen, setMenuOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(getTTSSettings);
  const [autoCopyTrigger, setAutoCopyTrigger] = useState(() => {
    const stored = localStorage.getItem('hw-chatbot-copy-trigger');
    return stored !== null ? stored === 'true' : true;
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const updateTTS = (patch: Partial<TTSSettings>) => {
    const next = { ...ttsSettings, ...patch };
    setTtsSettings(next);
    setTTSSettings(next);
  };

  const toggleAutoCopyTrigger = () => {
    const next = !autoCopyTrigger;
    setAutoCopyTrigger(next);
    localStorage.setItem('hw-chatbot-copy-trigger', String(next));
  };

  const openMenu = () => {
    const current = isLoggedIn
      ? (user.nickname || user.fullname || '')
      : myDisplayName.replace(/^Guest-/, '');
    setDraft(current);
    setMenuOpen(true);
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  const closeMenu = () => { setMenuOpen(false); setOpenSection(null); };

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
      setMenuOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') closeMenu();
  };

  const displayLabel = isLoggedIn
    ? (user.nickname || user.fullname || 'Hw')
    : myDisplayName || 'Hw';

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-700/60 shadow-[0_1px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_16px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto">
          {/* Left: back button or hamburger + nickname */}
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
              <div className="flex items-center gap-1.5">
                {/* Hamburger button */}
                <button
                  onClick={openMenu}
                  className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
                  aria-label="Open menu"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                {/* Nickname display (non-clickable) */}
                <span className="text-blue-500 font-bold text-sm truncate max-w-[90px]">{displayLabel}</span>
              </div>
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

      {/* Left slide-in menu panel */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex"
          onClick={closeMenu}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 transition-opacity" />

          {/* Drawer */}
          <div
            className="relative w-72 max-w-[85vw] h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-slide-in-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
              <span className="font-bold text-gray-800 dark:text-gray-100 text-base">Menu</span>
              <button
                onClick={closeMenu}
                className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close menu"
              >
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Row 1: Nickname edit */}
            <div className="border-b border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setOpenSection(s => s === 'nickname' ? null : 'nickname')}
                className="flex items-center justify-between w-full px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <span>{t('common.editNickname', 'Nickname')}</span>
                <svg className={`w-4 h-4 transition-transform duration-200 ${openSection === 'nickname' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openSection === 'nickname' && (
                <div className="px-4 pb-4">
                  <div className="relative mb-3">
                    {!isLoggedIn && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-blue-500 select-none pointer-events-none">
                        Guest-
                      </span>
                    )}
                    <input
                      ref={inputRef}
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value.slice(0, MAX_NICK))}
                      onKeyDown={handleKeyDown}
                      placeholder={isLoggedIn ? t('common.nicknamePlaceholder', 'Your nickname…') : t('guestSetup.placeholder')}
                      className={`w-full ${!isLoggedIn ? 'pl-[4.5rem]' : 'pl-3'} pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                  {!isLoggedIn && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
                      {t('common.editNicknameHintGuest', 'You\'ll appear as Guest-{name} to others.').replace('{name}', draft.trim() || '…')}
                    </p>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={!draft.trim() || saving}
                    className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-xl transition-colors text-sm"
                  >
                    {saving ? '…' : t('social.save')}
                  </button>
                </div>
              )}
            </div>

            {/* Row 2: Audio / TTS settings */}
            <div className="border-b border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setOpenSection(s => s === 'audio' ? null : 'audio')}
                className="flex items-center justify-between w-full px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <span>{t('common.audioSettings')}</span>
                <svg className={`w-4 h-4 transition-transform duration-200 ${openSection === 'audio' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openSection === 'audio' && (
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-gray-300">{t('common.ttsSpeed')}</span>
                      <span className="text-xs font-mono text-blue-500">{ttsSettings.speed.toFixed(1)}×</span>
                    </div>
                    <input
                      type="range" min={0.5} max={2} step={0.1}
                      value={ttsSettings.speed}
                      onChange={(e) => updateTTS({ speed: parseFloat(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-gray-300">{t('common.ttsVolume')}</span>
                      <span className="text-xs font-mono text-blue-500">{Math.round(ttsSettings.volume * 100)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={1} step={0.05}
                      value={ttsSettings.volume}
                      onChange={(e) => updateTTS({ volume: parseFloat(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-gray-300">{t('common.ttsPitch')}</span>
                      <span className="text-xs font-mono text-blue-500">{ttsSettings.pitch.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min={0.5} max={2} step={0.1}
                      value={ttsSettings.pitch}
                      onChange={(e) => updateTTS({ pitch: parseFloat(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Row 3: Assistant settings */}
            <div className="border-b border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setOpenSection(s => s === 'assistant' ? null : 'assistant')}
                className="flex items-center justify-between w-full px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <span>{t('chatbot.title')}</span>
                <svg className={`w-4 h-4 transition-transform duration-200 ${openSection === 'assistant' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openSection === 'assistant' && (
                <div className="px-4 pb-4">
                  <button
                    onClick={toggleAutoCopyTrigger}
                    className="flex items-center justify-between w-full text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  >
                    <span>{t('chatbot.autoCopyTrigger')}</span>
                    <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${autoCopyTrigger ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform duration-200 ${autoCopyTrigger ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
