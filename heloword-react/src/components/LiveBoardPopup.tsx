import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useBoard } from '../contexts/BoardContext';

const seenKey = (id: number) => `hw-board-popup-seen:${id}`;

/**
 * Global entry pop-up shown to every visitor while a session is live.
 * Appears once per session id (remembered in localStorage), never on the board
 * page itself. Also surfaces the register CTA for guests (marketing funnel).
 */
const LiveBoardPopup: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn } = useAuth();
  const { activeSession } = useBoard();
  const [dismissed, setDismissed] = useState(false);

  const onBoardPage = location.pathname.startsWith('/board/');

  // Reset the per-render dismissal whenever the live session changes.
  useEffect(() => {
    setDismissed(false);
  }, [activeSession?.id]);

  if (!activeSession || onBoardPage || dismissed) return null;
  if (localStorage.getItem(seenKey(activeSession.id))) return null;

  const close = () => {
    localStorage.setItem(seenKey(activeSession.id), '1');
    setDismissed(true);
  };

  const join = () => {
    localStorage.setItem(seenKey(activeSession.id), '1');
    setDismissed(true);
    navigate(`/board/${activeSession.id}`);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4" onClick={close}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wide text-red-500">{t('board.live', 'Live')}</span>
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1.5 break-words [overflow-wrap:anywhere]">
          {activeSession.name}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
          {t('board.popupBody', 'A live board is happening right now. Jump in to chat and interact!')}
        </p>
        <button
          onClick={join}
          className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors mb-2"
        >
          {t('board.joinNow', 'Join the live board')}
        </button>
        {!isLoggedIn && (
          <button
            onClick={() => { close(); navigate('/login'); }}
            className="w-full text-xs text-blue-500 hover:text-blue-700 py-1.5"
          >
            {t('board.registerCta', '✨ Create a free account to unlock the full app')}
          </button>
        )}
        <button
          onClick={close}
          className="w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-1"
        >
          {t('board.maybeLater', 'Maybe later')}
        </button>
      </div>
    </div>,
    document.body
  );
};

export default LiveBoardPopup;
