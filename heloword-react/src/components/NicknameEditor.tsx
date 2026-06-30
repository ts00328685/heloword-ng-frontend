import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSocial } from '../contexts/SocialContext';
import { doPut } from '../services/api.service';

const MAX_NICK = 20;

/**
 * Single source of truth for changing the user's display name.
 * - Logged-in members: PUT /fe/user/nickname + updateUser (same as the Header drawer).
 * - Guests: stored locally as "Guest-{name}" via SocialContext.setGuestName.
 * Returns true on success.
 */
export function useNicknameSave() {
  const { user, isLoggedIn, updateUser } = useAuth();
  const { setGuestName } = useSocial();

  return useCallback(
    async (raw: string): Promise<boolean> => {
      const trimmed = raw.trim().slice(0, MAX_NICK);
      if (!trimmed) return false;
      if (isLoggedIn) {
        const res = await doPut('/frontend-api/api/fe/user/nickname', { nickname: trimmed });
        if (res.code === '0000') {
          updateUser({ ...user, nickname: trimmed });
          return true;
        }
        return false;
      }
      setGuestName(`Guest-${trimmed}`);
      return true;
    },
    [user, isLoggedIn, updateUser, setGuestName]
  );
}

/**
 * Compact inline nickname editor for the live board composer. Reuses the exact
 * same save behaviour as the Header drawer via {@link useNicknameSave}.
 */
const NicknameEditor: React.FC<{ onSaved?: () => void }> = ({ onSaved }) => {
  const { t } = useTranslation();
  const { user, isLoggedIn } = useAuth();
  const { myDisplayName } = useSocial();
  const saveNickname = useNicknameSave();

  const currentLabel = isLoggedIn ? user.nickname || user.fullname || 'Hw' : myDisplayName || 'Guest';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const open = () => {
    setDraft(isLoggedIn ? user.nickname || user.fullname || '' : (myDisplayName || '').replace(/^Guest-/, ''));
    setEditing(true);
  };

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const ok = await saveNickname(draft);
      if (ok) {
        setEditing(false);
        onSaved?.();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={open}
        className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-500 transition-colors"
      >
        <span>
          {t('board.postingAs', 'Posting as')}{' '}
          <span className="font-semibold text-blue-500">{currentLabel}</span>
        </span>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        {!isLoggedIn && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-500 select-none pointer-events-none">
            Guest-
          </span>
        )}
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_NICK))}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || (e.nativeEvent as KeyboardEvent).keyCode === 229) return;
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder={isLoggedIn ? t('common.nicknamePlaceholder', 'Your nickname…') : t('guestSetup.placeholder', 'Your name')}
          className={`w-full ${!isLoggedIn ? 'pl-[3.6rem]' : 'pl-2.5'} pr-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
      </div>
      <button
        onClick={save}
        disabled={!draft.trim() || saving}
        className="bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors text-xs"
      >
        {saving ? '…' : t('social.save', 'Save')}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1"
      >
        {t('common.cancel', 'Cancel')}
      </button>
    </div>
  );
};

export default NicknameEditor;
