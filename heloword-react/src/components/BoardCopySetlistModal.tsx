import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  LiveBoardSession,
  LiveBoardSong,
  fetchBoardSessions,
  fetchBoardSongs,
} from '../services/board.service';

interface Props {
  /** The board being copied *into* — excluded from the picker. */
  sessionId: number;
  /** Runs the copy; resolves to an error message, or '' on success. */
  onCopy: (sourceSessionId: number) => Promise<string>;
  onClose: () => void;
}

const formatDate = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

/**
 * Admin-only setlist import. Picking a past board previews its songs before
 * anything is written — copying blind into a live board is the kind of mistake
 * you only notice mid-set. The copy appends fresh rows; the source is untouched.
 */
const BoardCopySetlistModal: React.FC<Props> = ({ sessionId, onCopy, onClose }) => {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<LiveBoardSession[] | null>(null);
  const [selected, setSelected] = useState<LiveBoardSession | null>(null);
  const [preview, setPreview] = useState<LiveBoardSong[] | null>(null);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchBoardSessions().then((list) => {
      if (alive) setSessions(list.filter((s) => s.id !== sessionId));
    });
    return () => { alive = false; };
  }, [sessionId]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setPreview(null);
    fetchBoardSongs(selected.id).then((list) => {
      if (alive) setPreview(list);
    });
    return () => { alive = false; };
  }, [selected]);

  const confirm = async () => {
    if (!selected || copying) return;
    setCopying(true);
    setError('');
    const message = await onCopy(selected.id);
    setCopying(false);
    if (message) setError(message);
    else onClose();
  };

  const spinner = (
    <div className="flex justify-center py-8">
      <div className="w-6 h-6 border-[3px] border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-ink/20" />
        </div>

        <div className="px-6 pt-4 pb-3 border-b border-line flex items-center gap-2">
          {selected && (
            <button
              onClick={() => { setSelected(null); setError(''); }}
              className="-ml-2 p-1 text-ink-faint hover:text-ink-muted"
              aria-label={t('common.back', 'Back')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h2 className="text-base font-semibold text-ink truncate">
            {selected ? selected.name : t('board.copySetlist', 'Copy a setlist')}
          </h2>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 text-ink-faint hover:text-ink-muted"
            aria-label={t('common.close', 'Close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step 1 — pick a board */}
        {!selected && (
          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
            {sessions === null && spinner}
            {sessions?.length === 0 && (
              <p className="text-sm text-ink-faint text-center py-6">
                {t('board.noOtherBoards', 'No other boards to copy from.')}
              </p>
            )}
            {sessions?.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-line bg-paper text-left hover:bg-ink/5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">{s.name}</p>
                  <p className="text-[11px] text-ink-faint">{formatDate(s.createDate)}</p>
                </div>
                {s.boardState === 'ACTIVE' && (
                  <span className="shrink-0 text-[10px] font-semibold text-danger">
                    {t('board.live', 'Live')}
                  </span>
                )}
                <svg className="w-4 h-4 shrink-0 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — preview what will be copied */}
        {selected && (
          <>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1">
              {preview === null && spinner}
              {preview?.length === 0 && (
                <p className="text-sm text-ink-faint text-center py-6">
                  {t('board.noSongs', 'No songs yet.')}
                </p>
              )}
              {preview?.map((song, idx) => (
                <div key={song.id} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-paper">
                  <span className="shrink-0 w-5 text-right text-xs font-semibold text-ink-faint tabular-nums pt-0.5">
                    {idx + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink break-words [overflow-wrap:anywhere]">
                      {song.title}
                    </p>
                    {song.note && (
                      <p className="text-[11px] text-ink-faint break-words [overflow-wrap:anywhere]">
                        {song.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-line px-4 py-3">
              {error && <p className="text-xs text-danger mb-2">{error}</p>}
              <p className="text-[11px] text-ink-faint mb-2">
                {t(
                  'board.copyHint',
                  'Songs are added to the end of this board’s setlist as new entries — unsung, with no requests carried over.'
                )}
              </p>
              <button
                onClick={confirm}
                disabled={copying || !preview || preview.length === 0}
                className="w-full min-h-[44px] bg-ink hover:bg-ink/85 active:bg-ink/85 disabled:opacity-40 text-paper font-semibold rounded-xl transition-colors text-sm"
              >
                {copying
                  ? '…'
                  : t('board.copyNSongs', 'Copy {n} songs').replace('{n}', String(preview?.length ?? 0))}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default BoardCopySetlistModal;
