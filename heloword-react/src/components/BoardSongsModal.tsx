import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LiveBoardSong, addBoardSong, deleteBoardSong, toggleBoardSong } from '../services/board.service';

interface Props {
  sessionId: number;
  songs: LiveBoardSong[];
  isAdmin: boolean;
  active: boolean;
  onClose: () => void;
}

/**
 * Setlist modal. Everyone can request a song; admin marks songs sung / performing,
 * adds and deletes. Synced live over /topic/board/{id}/songs.
 */
const BoardSongsModal: React.FC<Props> = ({ sessionId, songs, isAdmin, active, onClose }) => {
  const { t } = useTranslation();
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Admin keeps full control of the setlist even after the session has ended
  // (fix the running order, mark encores, tidy up); the audience "request"
  // action stays gated on a live session.
  const toggle = (songId: number, action: 'sung' | 'request' | 'performing') => {
    const adminAction = action !== 'request' && isAdmin;
    if (!active && !adminAction) return;
    toggleBoardSong(sessionId, songId, action).catch(() => {});
  };

  const remove = (songId: number) => {
    deleteBoardSong(sessionId, songId).catch(() => {});
  };

  const add = async () => {
    if (!newTitle.trim() || adding) return;
    setAdding(true);
    try {
      await addBoardSong(sessionId, newTitle.trim());
      setNewTitle('');
    } finally {
      setAdding(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        <div className="px-6 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
            {t('board.setlist', 'Setlist')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
          {songs.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
              {t('board.noSongs', 'No songs yet.')}
            </p>
          )}
          {songs.map((song, idx) => (
            <div
              key={song.id}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors ${
                song.performing
                  ? 'bg-amber-50 dark:bg-amber-900/25 border-amber-300 dark:border-amber-600 ring-1 ring-amber-300/60 dark:ring-amber-500/30'
                  : song.sung
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700'
              }`}
            >
              {/* Sequence number */}
              <span className="shrink-0 w-6 text-right text-xs font-bold text-gray-400 dark:text-gray-500 tabular-nums">
                {idx + 1}.
              </span>

              {/* Sung status — toggle for admin, read-only indicator for everyone else */}
              {isAdmin ? (
                <button
                  onClick={() => toggle(song.id, 'sung')}
                  disabled={!active && !isAdmin}
                  className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors disabled:opacity-50 ${
                    song.sung ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-500'
                  }`}
                  aria-label={t('board.markSung', 'Mark sung')}
                  title={t('board.markSung', 'Mark sung')}
                >
                  {song.sung && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ) : (
                <span
                  className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                    song.sung ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-500'
                  }`}
                  aria-hidden="true"
                >
                  {song.sung && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              )}

              {/* Performing-now checkbox (admin only) */}
              {isAdmin && (
                <button
                  onClick={() => toggle(song.id, 'performing')}
                  disabled={!active && !isAdmin}
                  className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors disabled:opacity-50 ${
                    song.performing ? 'bg-amber-500 border-amber-500' : 'border-gray-300 dark:border-gray-500'
                  }`}
                  aria-label={t('board.performing', 'Performing now')}
                  title={t('board.performing', 'Performing now')}
                >
                  <svg className={`w-3 h-3 ${song.performing ? 'text-white' : 'text-gray-400 dark:text-gray-500'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6 4l10 6-10 6z" />
                  </svg>
                </button>
              )}

              <span
                className={`flex-1 text-sm break-words [overflow-wrap:anywhere] ${
                  song.sung
                    ? 'line-through text-gray-400 dark:text-gray-500'
                    : 'text-gray-800 dark:text-gray-100'
                }`}
              >
                {song.title}
                {song.performing && (
                  <span className="ml-2 inline-flex items-center gap-1 align-middle text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    {t('board.nowPlaying', 'Now')}
                  </span>
                )}
              </span>

              {/* Request (everyone) */}
              <button
                onClick={() => toggle(song.id, 'request')}
                disabled={!active}
                className="shrink-0 inline-flex items-center gap-1 text-xs text-pink-500 hover:text-pink-600 disabled:opacity-50"
                aria-label={t('board.request', 'Request')}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                </svg>
                {song.requestCount > 0 && <span className="font-semibold">{song.requestCount}</span>}
              </button>

              {/* Delete (admin only) */}
              {isAdmin && (
                <button
                  onClick={() => setConfirmDeleteId(song.id)}
                  className="shrink-0 text-gray-300 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  aria-label={t('board.delete', 'Delete')}
                  title={t('board.delete', 'Delete')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 flex gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value.slice(0, 120))}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || (e.nativeEvent as KeyboardEvent).keyCode === 229) return;
                if (e.key === 'Enter') add();
              }}
              placeholder={t('board.addSong', 'Add a song…')}
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={add}
              disabled={!newTitle.trim() || adding}
              className="bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-semibold px-4 rounded-xl transition-colors text-sm"
            >
              {adding ? '…' : t('common.add', 'Add')}
            </button>
          </div>
        )}

        {confirmDeleteId !== null && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4"
            onClick={() => setConfirmDeleteId(null)}
          >
            <div
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs p-6 animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm text-gray-700 dark:text-gray-200 mb-5">
                {t('board.confirmDeleteSong', 'Delete this song?')}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={() => { remove(confirmDeleteId); setConfirmDeleteId(null); }}
                  className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-semibold text-sm transition-colors"
                >
                  {t('board.delete', 'Delete')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default BoardSongsModal;
