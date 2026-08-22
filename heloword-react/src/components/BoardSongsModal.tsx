import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useImeText } from '../hooks/useImeText';
import BoardCopySetlistModal from './BoardCopySetlistModal';
import {
  LiveBoardSong,
  addBoardSong,
  copyBoardSongs,
  deleteBoardSong,
  reorderBoardSongs,
  toggleBoardSong,
  updateBoardSong,
} from '../services/board.service';

/** Reorder taps are batched — a run of arrow presses saves once, not per tap. */
const REORDER_SAVE_MS = 500;

interface Props {
  sessionId: number;
  songs: LiveBoardSong[];
  isAdmin: boolean;
  active: boolean;
  /**
   * Applies a setlist the admin's own request came back with. Those responses
   * carry the host-private notes that the public /songs broadcast strips, so
   * they must not be left to the socket to deliver.
   */
  onSongsChange: (songs: LiveBoardSong[]) => void;
  onClose: () => void;
}

/**
 * Setlist modal. Everyone can request a song; admin marks songs sung / performing,
 * adds and deletes. Synced live over /topic/board/{id}/songs.
 *
 * Admin also gets an edit mode for the things that shouldn't be one mis-tap away
 * mid-set: running order, private notes, and importing another board's setlist.
 */
const BoardSongsModal: React.FC<Props> = ({ sessionId, songs, isAdmin, active, onSongsChange, onClose }) => {
  const { t } = useTranslation();
  const newTitle = useImeText(120);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  /** Optimistic running order held while the debounced save is in flight. */
  const [pendingOrder, setPendingOrder] = useState<number[] | null>(null);

  const saveTimer = useRef<number | null>(null);
  const flushReorder = useRef<(() => void) | null>(null);

  // A reorder still sitting in the debounce window when the modal closes would
  // otherwise be dropped — send it on the way out.
  useEffect(() => () => { flushReorder.current?.(); }, []);

  const ordered = useMemo(() => {
    if (!pendingOrder) return songs;
    const byId = new Map(songs.map((s) => [s.id, s]));
    const list = pendingOrder.map((id) => byId.get(id)).filter((s): s is LiveBoardSong => !!s);
    // Anything added while we were reordering (another admin tab) goes last.
    songs.forEach((s) => { if (!pendingOrder.includes(s.id)) list.push(s); });
    return list;
  }, [songs, pendingOrder]);

  // Admin keeps full control of the setlist even after the session has ended
  // (fix the running order, mark encores, tidy up); the audience "request"
  // action stays gated on a live session.
  const toggle = (songId: number, action: 'sung' | 'request' | 'performing') => {
    const adminAction = action !== 'request' && isAdmin;
    if (!active && !adminAction) return;
    toggleBoardSong(sessionId, songId, action)
      .then((list) => { if (list.length) onSongsChange(list); })
      .catch(() => {});
  };

  const remove = (songId: number) => {
    deleteBoardSong(sessionId, songId)
      .then((list) => onSongsChange(list))
      .catch(() => {});
  };

  const add = async () => {
    if (!newTitle.value.trim() || adding) return;
    setAdding(true);
    try {
      const list = await addBoardSong(sessionId, newTitle.value.trim());
      if (list.length) onSongsChange(list);
      newTitle.reset();
    } finally {
      setAdding(false);
    }
  };

  const move = (idx: number, delta: number) => {
    const next = ordered.map((s) => s.id);
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setPendingOrder(next);

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const save = () => {
      saveTimer.current = null;
      flushReorder.current = null;
      reorderBoardSongs(sessionId, next)
        .then((list) => { if (list.length) onSongsChange(list); })
        .catch(() => {})
        .finally(() => setPendingOrder(null));
    };
    flushReorder.current = () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      save();
    };
    saveTimer.current = window.setTimeout(save, REORDER_SAVE_MS);
  };

  /**
   * Commits a row edit. Title and note travel together because the row always
   * knows both, which keeps this to one endpoint and one round trip.
   *
   * The inputs are uncontrolled on purpose: song titles and cue notes get typed
   * in Chinese, and rewriting a controlled value mid-composition is exactly what
   * drops IME candidates on iOS (the same trap `useImeText` exists to avoid —
   * but that hook is per-field and can't be called once per row).
   */
  const saveSong = (song: LiveBoardSong, edited: { title?: string; note?: string }) => {
    const title = (edited.title ?? song.title).trim().slice(0, 200);
    const note = (edited.note ?? song.note ?? '').trim().slice(0, 500);
    if (!title || (title === song.title && note === (song.note ?? '').trim())) return;
    updateBoardSong(sessionId, song.id, title, note)
      .then((list) => { if (list.length) onSongsChange(list); })
      .catch(() => {});
  };

  /** Enter commits, except the Enter that is confirming an IME candidate. */
  const commitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const native = e.nativeEvent as KeyboardEvent;
    if (native.isComposing || native.keyCode === 229) return;
    e.currentTarget.blur();
  };

  const copy = async (sourceSessionId: number): Promise<string> => {
    const res = await copyBoardSongs(sessionId, sourceSessionId);
    if (res.ok && res.data) onSongsChange(res.data);
    return res.ok ? '' : res.message || t('board.copyFailed', 'Could not copy that setlist.');
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

        <div className="px-6 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
            {t('board.setlist', 'Setlist')}
          </h2>

          {isAdmin && (
            <>
              <button
                onClick={() => setCopyOpen(true)}
                className="ml-auto shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={t('board.copySetlist', 'Copy a setlist')}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {t('board.copy', 'Copy')}
              </button>
              <button
                onClick={() => setEditMode((v) => !v)}
                aria-pressed={editMode}
                className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  editMode
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {editMode ? t('common.done', 'Done') : t('common.edit', 'Edit')}
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className={`shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ${isAdmin ? '' : 'ml-auto'}`}
            aria-label={t('common.close', 'Close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
          {ordered.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
              {t('board.noSongs', 'No songs yet.')}
            </p>
          )}
          {ordered.map((song, idx) => (
            <div
              key={song.id}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors ${
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

              {editMode && isAdmin ? (
                /* Edit mode: running order and the private note. The performance
                   controls are hidden here so a reorder tap can't mark a song
                   sung by accident. */
                <>
                  <div className="shrink-0 flex flex-col">
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="w-8 h-7 inline-flex items-center justify-center rounded-t-lg text-gray-500 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 disabled:opacity-30 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
                      aria-label={t('board.moveUp', 'Move up')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => move(idx, 1)}
                      disabled={idx === ordered.length - 1}
                      className="w-8 h-7 inline-flex items-center justify-center rounded-b-lg text-gray-500 dark:text-gray-300 bg-white dark:bg-gray-800 border border-t-0 border-gray-200 dark:border-gray-600 disabled:opacity-30 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
                      aria-label={t('board.moveDown', 'Move down')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      type="text"
                      defaultValue={song.title}
                      onBlur={(e) => {
                        // Blanking a title would leave an unidentifiable row, so
                        // an empty field reverts rather than saving.
                        if (!e.target.value.trim()) {
                          e.target.value = song.title;
                          return;
                        }
                        saveSong(song, { title: e.target.value });
                      }}
                      onKeyDown={commitOnEnter}
                      enterKeyHint="done"
                      autoCorrect="off"
                      aria-label={t('board.songTitle', 'Song name')}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      defaultValue={song.note ?? ''}
                      onBlur={(e) => saveSong(song, { note: e.target.value })}
                      onKeyDown={commitOnEnter}
                      enterKeyHint="done"
                      autoCorrect="off"
                      aria-label={t('board.note', 'Private note')}
                      placeholder={t('board.notePlaceholder', 'Private note (key, capo, cue…)')}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    onClick={() => setConfirmDeleteId(song.id)}
                    className="shrink-0 min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-xl text-gray-300 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    aria-label={t('board.delete', 'Delete')}
                    title={t('board.delete', 'Delete')}
                  >
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  {/* Sung status — toggle for admin, read-only indicator for everyone else */}
                  {isAdmin ? (
                    <button
                      onClick={() => toggle(song.id, 'sung')}
                      className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
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
                      className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
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
                    {/* Host-only cue line. The server never sends `note` to the
                        audience, so this can't leak by a rendering slip. */}
                    {isAdmin && song.note && (
                      <span className="block mt-0.5 text-[11px] font-normal not-italic text-gray-400 dark:text-gray-500 no-underline">
                        {song.note}
                      </span>
                    )}
                  </span>

                  {/* Request (everyone) */}
                  <button
                    onClick={() => toggle(song.id, 'request')}
                    disabled={!active}
                    className="shrink-0 min-w-[44px] min-h-[44px] -ml-1 inline-flex items-center justify-center gap-1 rounded-xl text-xs text-pink-500 hover:text-pink-600 active:scale-90 transition-transform disabled:opacity-50"
                    aria-label={t('board.request', 'Request')}
                  >
                    <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                    </svg>
                    {song.requestCount > 0 && <span className="font-semibold tabular-nums">{song.requestCount}</span>}
                  </button>

                  {/* Look the song up — half the audience won't know it by title,
                      and the full-colour mark is recognised without a label. */}
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(song.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 min-w-[44px] min-h-[44px] -mr-1.5 inline-flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-90 transition-all"
                    aria-label={t('board.googleSong', 'Search {title} on Google').replace('{title}', song.title)}
                    title={t('board.googleIt', 'Google it')}
                  >
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                  </a>
                </>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 flex gap-2">
            <input
              type="text"
              {...newTitle.bind}
              onKeyDown={(e) => {
                if (newTitle.isImeKey(e)) return;
                if (e.key === 'Enter') add();
              }}
              enterKeyHint="done"
              autoCorrect="off"
              placeholder={t('board.addSong', 'Add a song…')}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={add}
              disabled={!newTitle.value.trim() || adding}
              className="shrink-0 min-h-[44px] bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-semibold px-4 rounded-xl transition-colors text-sm"
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

        {copyOpen && (
          <BoardCopySetlistModal
            sessionId={sessionId}
            onCopy={copy}
            onClose={() => setCopyOpen(false)}
          />
        )}
      </div>
    </div>,
    document.body
  );
};

export default BoardSongsModal;
