import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSocial } from '../../contexts/SocialContext';
import { useImeText } from '../../hooks/useImeText';

const MAX_NICK = 16;

interface Props {
  /**
   * Fired once a name is settled, carrying the chosen name — the caller retries
   * the post with it. Passed explicitly rather than read from context, which
   * hasn't re-rendered with the new name yet at this point.
   */
  onDone: (name: string) => void;
  onCancel: () => void;
}

/**
 * Asks a guest for a display name at the moment they first post, rather than
 * blocking the board on arrival. Either branch writes `hw-guest-name`, so this
 * is asked exactly once: naming yourself and keeping the auto-assigned handle
 * are both answers.
 */
const BoardGuestNamePrompt: React.FC<Props> = ({ onDone, onCancel }) => {
  const { t } = useTranslation();
  const { myDisplayName, setGuestName } = useSocial();
  const name = useImeText(MAX_NICK);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, []);

  const confirm = () => {
    const trimmed = name.value.trim();
    if (!trimmed) return;
    const full = `Guest-${trimmed}`;
    setGuestName(full);
    onDone(full);
  };

  // Keeping the auto-assigned handle is a valid choice — persist it so the
  // question isn't asked again on the next message.
  const keepAuto = () => {
    const auto = myDisplayName || 'Guest';
    setGuestName(auto);
    onDone(auto);
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl px-5 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-ink/20 mx-auto my-2 sm:hidden" />

        <h2 className="text-base font-semibold text-ink mt-2 mb-1">
          {t('board.nameTitle', 'What should we call you?')}
        </h2>
        <p className="text-xs text-ink-muted mb-4">
          {t('board.nameSubtitle', 'This is the name shown next to your message.')}
        </p>

        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-accent select-none pointer-events-none">
            Guest-
          </span>
          <input
            ref={inputRef}
            type="text"
            {...name.bind}
            onKeyDown={(e) => {
              if (name.isImeKey(e)) return;
              if (e.key === 'Enter') confirm();
              if (e.key === 'Escape') onCancel();
            }}
            enterKeyHint="done"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={t('guestSetup.placeholder', 'Your nickname...')}
            className="w-full pl-[4.5rem] pr-3 py-3 rounded-xl border border-line bg-paper text-ink text-base focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <button
          onClick={confirm}
          disabled={!name.value.trim()}
          className="w-full min-h-[44px] bg-ink hover:bg-ink/85 active:bg-ink/85 disabled:opacity-40 text-paper font-semibold py-3 rounded-xl transition-colors mb-2"
        >
          {t('board.nameConfirm', 'Post as this name')}
        </button>
        <button
          onClick={keepAuto}
          className="w-full min-h-[44px] text-sm text-ink-faint hover:text-ink-muted py-2 transition-colors"
        >
          {t('board.nameKeep', 'Keep {name}').replace('{name}', myDisplayName || 'Guest')}
        </button>
      </div>
    </div>
  );
};

export default BoardGuestNamePrompt;
