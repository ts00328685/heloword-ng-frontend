import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSocial } from '../contexts/SocialContext';
import { useImeText } from '../hooks/useImeText';
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
  const draft = useImeText(MAX_NICK);
  const [saving, setSaving] = useState(false);

  const open = () => {
    draft.set(isLoggedIn ? user.nickname || user.fullname || '' : (myDisplayName || '').replace(/^Guest-/, ''));
    setEditing(true);
  };

  const save = async () => {
    if (!draft.value.trim()) return;
    setSaving(true);
    try {
      const ok = await saveNickname(draft.value);
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
        className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-accent transition-colors"
      >
        <span>
          {t('board.postingAs', 'Posting as')}{' '}
          <span className="font-semibold text-accent">{currentLabel}</span>
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
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-accent select-none pointer-events-none">
            Guest-
          </span>
        )}
        <input
          autoFocus
          type="text"
          {...draft.bind}
          onKeyDown={(e) => {
            if (draft.isImeKey(e)) return;
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          enterKeyHint="done"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={isLoggedIn ? t('common.nicknamePlaceholder', 'Your nickname…') : t('guestSetup.placeholder', 'Your name')}
          className={`w-full ${!isLoggedIn ? 'pl-[3.6rem]' : 'pl-2.5'} pr-2 py-2 rounded-lg border border-line bg-paper text-ink text-base focus:outline-none focus:ring-2 focus:ring-accent`}
        />
      </div>
      <button
        onClick={save}
        disabled={!draft.value.trim() || saving}
        className="shrink-0 min-h-[38px] bg-ink hover:bg-ink/85 disabled:opacity-40 text-paper font-semibold px-3 py-2 rounded-lg transition-colors text-xs"
      >
        {saving ? '…' : t('social.save', 'Save')}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="shrink-0 min-h-[38px] text-xs text-ink-faint hover:text-ink-muted px-2"
      >
        {t('common.cancel', 'Cancel')}
      </button>
    </div>
  );
};

export default NicknameEditor;
