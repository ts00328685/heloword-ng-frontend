import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Client } from '@stomp/stompjs';
import Header from '../../components/Header';
import NicknameEditor from '../../components/NicknameEditor';
import BoardSongsModal from '../../components/BoardSongsModal';
import { useAuth } from '../../contexts/AuthContext';
import { useSocial } from '../../contexts/SocialContext';
import { useBoard } from '../../contexts/BoardContext';
import { environment } from '../../config/environment';
import {
  LiveBoardEvent,
  LiveBoardMessage,
  LiveBoardSession,
  LiveBoardSong,
  deleteBoardMessage,
  fetchBoardSnapshot,
  likeBoardMessage,
  muteBoardUser,
  postBoardMessage,
  postOfficialMessage,
  sendBoardPresence,
  unmuteBoardUser,
} from '../../services/board.service';

const MAX_LEN = 1000;

/** Format a message timestamp in Taipei time (GMT+8): "MM/DD HH:mm". */
const formatTime = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const BoardPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const id = Number(sessionId);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { hasAnyRole, isLoggedIn } = useAuth();
  const { myUserId, myDisplayName } = useSocial();
  const { applyActiveBroadcast } = useBoard();
  const isAdmin = hasAnyRole(['ADMIN']);

  const [session, setSession] = useState<LiveBoardSession | null>(null);
  const [messages, setMessages] = useState<LiveBoardMessage[]>([]);
  const [songs, setSongs] = useState<LiveBoardSong[]>([]);
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [presence, setPresence] = useState(0);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [songsOpen, setSongsOpen] = useState(false);
  const [officialMode, setOfficialMode] = useState(false);

  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const active = session?.boardState === 'ACTIVE';
  const iAmMuted = mutedIds.has(myUserId);
  const officials = messages.filter((m) => m.official);
  const comments = messages.filter((m) => !m.official);
  const performingSong = songs.find((s) => s.performing) || null;

  // ── Load snapshot ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    fetchBoardSnapshot(id, myUserId || undefined).then((snap) => {
      if (!alive || !snap) {
        if (alive) setLoading(false);
        return;
      }
      setSession(snap.session);
      setMessages(snap.messages);
      setSongs(snap.songs);
      setMutedIds(new Set(snap.mutedUserIds));
      setLikedIds(new Set(snap.likedMessageIds || []));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [id, myUserId]);

  // ── WebSocket (STOMP) — only while this page is mounted ──────────────────────
  const onEvent = useCallback((ev: LiveBoardEvent) => {
    switch (ev.type) {
      case 'DELETE':
        setMessages((prev) => prev.filter((m) => m.id !== ev.messageId));
        break;
      case 'MUTE':
        if (ev.userId) setMutedIds((prev) => new Set(prev).add(ev.userId!));
        break;
      case 'UNMUTE':
        if (ev.userId) setMutedIds((prev) => { const n = new Set(prev); n.delete(ev.userId!); return n; });
        break;
      case 'PRESENCE':
        if (typeof ev.presence === 'number') setPresence(ev.presence);
        break;
      case 'LIKE':
        if (ev.messageId != null && typeof ev.likeCount === 'number') {
          setMessages((prev) => prev.map((m) => (m.id === ev.messageId ? { ...m, likeCount: ev.likeCount! } : m)));
        }
        break;
      case 'SESSION_ENDED':
        setSession((prev) => (prev ? { ...prev, boardState: 'ENDED' } : prev));
        break;
      case 'SESSION_RESTARTED':
        setSession((prev) => (prev ? { ...prev, boardState: 'ACTIVE' } : prev));
        break;
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsBasePath = environment.production ? '/k8s/frontend-api/v1' : '/k8s/frontend-api/api';
    const wsUrl = `${proto}://${window.location.host}${wsBasePath}/fe/ws`;

    const client = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        // Re-sync after a (re)connect so no events were missed while offline.
        fetchBoardSnapshot(id, myUserIdRef.current || undefined).then((snap) => {
          if (!snap) return;
          setSession(snap.session);
          setMessages(snap.messages);
          setSongs(snap.songs);
          setMutedIds(new Set(snap.mutedUserIds));
          setLikedIds(new Set(snap.likedMessageIds || []));
        });
        client.subscribe(`/topic/board/${id}/messages`, (frame) => {
          try {
            const msg: LiveBoardMessage = JSON.parse(frame.body);
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          } catch { /* ignore */ }
        });
        client.subscribe(`/topic/board/${id}/events`, (frame) => {
          try { onEvent(JSON.parse(frame.body)); } catch { /* ignore */ }
        });
        client.subscribe(`/topic/board/${id}/songs`, (frame) => {
          try { setSongs(JSON.parse(frame.body) || []); } catch { /* ignore */ }
        });
        client.subscribe('/topic/board/active', (frame) => {
          try { applyActiveBroadcast(JSON.parse(frame.body)); } catch { /* ignore */ }
        });
      },
      onStompError: (frame) => console.warn('Board STOMP error', frame.headers['message']),
    });
    client.activate();
    return () => { client.deactivate(); };
  }, [id, onEvent, applyActiveBroadcast]);

  // ── Presence heartbeat ───────────────────────────────────────────────────--
  useEffect(() => {
    if (!id || !myUserId || !active) return;
    const beat = () => { sendBoardPresence(id, myUserId).then(setPresence).catch(() => {}); };
    beat();
    const timer = setInterval(beat, 30_000);
    return () => clearInterval(timer);
  }, [id, myUserId, active]);

  // ── Auto-scroll to newest unless the user scrolled up ────────────────────────
  useEffect(() => {
    if (atBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // ── Actions ──────────────────────────────────────────────────────────────--
  const send = async () => {
    const content = draft.trim();
    if (!content || posting) return;
    setPosting(true);
    setError('');
    try {
      if (officialMode && isAdmin) {
        const msg = await postOfficialMessage(id, content);
        if (msg) setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        setDraft('');
      } else {
        const res = await postBoardMessage(id, content, myUserId, myDisplayName);
        if (res.ok) {
          if (res.data) setMessages((prev) => (prev.some((m) => m.id === res.data!.id) ? prev : [...prev, res.data!]));
          setDraft('');
        } else {
          setError(res.message || t('board.postFailed', 'Could not post your message.'));
        }
      }
    } finally {
      setPosting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Ignore Enter while an IME (e.g. macOS Chinese/Japanese) is composing —
    // that Enter is confirming a candidate, not submitting the message.
    if (e.nativeEvent.isComposing || (e.nativeEvent as KeyboardEvent).keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleDelete = (messageId: number) => {
    deleteBoardMessage(messageId).then((ok) => {
      if (ok) setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });
  };

  const handleMute = (userId: string, name: string) => {
    if (mutedIds.has(userId)) {
      unmuteBoardUser(id, userId).then((ids) => setMutedIds(new Set(ids)));
    } else {
      muteBoardUser(id, userId, name).then((ids) => setMutedIds(new Set(ids)));
    }
  };

  const toggleLike = async (msg: LiveBoardMessage) => {
    if (!myUserId) return;
    const wasLiked = likedIds.has(msg.id);
    // Optimistic update; the server response + WS LIKE event reconcile the count.
    setLikedIds((prev) => {
      const n = new Set(prev);
      if (wasLiked) n.delete(msg.id); else n.add(msg.id);
      return n;
    });
    setMessages((prev) => prev.map((m) =>
      m.id === msg.id ? { ...m, likeCount: Math.max(0, (m.likeCount || 0) + (wasLiked ? -1 : 1)) } : m
    ));
    const res = await likeBoardMessage(id, msg.id, myUserId);
    if (res) {
      setLikedIds((prev) => {
        const n = new Set(prev);
        if (res.liked) n.add(msg.id); else n.delete(msg.id);
        return n;
      });
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, likeCount: res.likeCount } : m)));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────--
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title={t('board.liveBoard', 'Live Board')} showBack />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title={t('board.liveBoard', 'Live Board')} showBack />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-gray-500 dark:text-gray-400">{t('board.notFound', 'This board is not available.')}</p>
          <button onClick={() => navigate('/home')} className="text-blue-500 font-medium">
            {t('board.backHome', 'Back to home')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={session.name} showBack />

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2 min-w-0">
          {active ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {t('board.live', 'Live')}
            </span>
          ) : (
            <span className="text-xs font-semibold text-gray-400">{t('board.ended', 'Ended')}</span>
          )}
          {active && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              · {t('board.viewers', '{n} watching').replace('{n}', String(presence))}
            </span>
          )}
        </div>
        <button
          onClick={() => setSongsOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {t('board.setlist', 'Setlist')}{songs.length > 0 ? ` (${songs.length})` : ''}
        </button>
      </div>

      {/* Now-performing banner + pinned official messages */}
      {(performingSong || officials.length > 0) && (
        <div className="px-4 pt-3 space-y-2 max-w-2xl mx-auto w-full">
          {performingSong && (
            <div className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3 py-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
              <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M18 3a1 1 0 00-1.196-.98l-8 1.6A1 1 0 008 4.6v7.07A3.5 3.5 0 109 14.5V8.82l7-1.4v3.25a3.5 3.5 0 101 2.45V3z" />
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-wide shrink-0">{t('board.nowPlaying', 'Now')}</span>
              <span className="text-xs font-semibold truncate">{performingSong.title}</span>
            </div>
          )}
          {officials.map((m) => (
            <div
              key={m.id}
              className="board-official-gold rounded-2xl px-4 py-3"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <a
                  href="https://www.instagram.com/ryan8787ccc/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="shrink-0 text-amber-300 hover:text-amber-200 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                </a>
                <span className="text-sm font-bold tracking-wide text-amber-300 [text-shadow:0_0_10px_rgba(251,191,36,0.45)]">{m.authorName}</span>
                <span className="ml-auto shrink-0 text-[10px] text-amber-200/60">{formatTime(m.createDate)}</span>
                {isAdmin && (
                  <button onClick={() => handleDelete(m.id)} className="shrink-0 text-amber-200/70 hover:text-amber-100 font-medium text-xs">
                    {t('board.delete', 'Delete')}
                  </button>
                )}
              </div>
              <p className="text-[15px] font-medium leading-relaxed text-amber-50 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-w-2xl mx-auto w-full"
      >
        {comments.length === 0 && (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">
            {t('board.beFirst', 'No messages yet — be the first to say hi! 👋')}
          </p>
        )}
        {comments.map((m) => {
          const mine = m.authorUserId === myUserId;
          const isHost = !!session?.createdByUserId && m.authorUserId === session.createdByUserId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] group`}>
                <div className={`flex items-center gap-2 mb-0.5 ${mine ? 'justify-end' : ''}`}>
                  {isHost && !mine && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full shrink-0">
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2.5 6.5l3 2.5 4.5-5.5 4.5 5.5 3-2.5-1.2 8.5H3.7L2.5 6.5z" />
                      </svg>
                      {t('board.host', 'Host')}
                    </span>
                  )}
                  <span className={`text-[11px] font-semibold truncate max-w-[110px] ${isHost && !mine ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {mine ? t('board.you', 'You') : m.authorName}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{formatTime(m.createDate)}</span>
                  <button
                    onClick={() => toggleLike(m)}
                    className={`shrink-0 inline-flex items-center gap-0.5 text-[11px] transition-colors ${
                      likedIds.has(m.id) ? 'text-pink-500' : 'text-gray-400 hover:text-pink-500'
                    }`}
                    aria-label={t('board.like', 'Like')}
                  >
                    <svg className="w-3.5 h-3.5" fill={likedIds.has(m.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    {m.likeCount > 0 && <span className="font-semibold">{m.likeCount}</span>}
                  </button>
                  {isAdmin && !mine && (
                    <span className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => handleDelete(m.id)} className="text-[10px] text-red-400 hover:text-red-600">
                        {t('board.delete', 'Delete')}
                      </button>
                      <button onClick={() => handleMute(m.authorUserId, m.authorName)} className="text-[10px] text-amber-500 hover:text-amber-600">
                        {mutedIds.has(m.authorUserId) ? t('board.unmute', 'Unmute') : t('board.mute', 'Mute')}
                      </button>
                    </span>
                  )}
                </div>
                <div
                  className={`px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                    mine
                      ? 'bg-blue-500 text-white rounded-br-sm'
                      : isHost
                        ? 'bg-amber-50 dark:bg-amber-900/25 text-gray-900 dark:text-amber-50 border border-amber-300 dark:border-amber-600/70 ring-1 ring-amber-300/60 dark:ring-amber-500/30 shadow-sm rounded-bl-sm'
                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer / ended notice */}
      <div className="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 max-w-2xl mx-auto w-full">
        {!active ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-2">
            {t('board.endedNotice', 'This session has ended. You can read the messages but can no longer post.')}
          </p>
        ) : iAmMuted ? (
          <p className="text-center text-sm text-amber-500 py-2">
            {t('board.mutedNotice', 'You have been muted by the host.')}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <NicknameEditor />
              {isAdmin && (
                <button
                  onClick={() => setOfficialMode((v) => !v)}
                  className={`text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors ${
                    officialMode
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                  }`}
                >
                  {t('board.officialMode', 'Official')}
                </button>
              )}
            </div>
            {error && <p className="text-xs text-red-500 mb-1.5">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={
                  officialMode && isAdmin
                    ? t('board.officialPlaceholder', 'Post an official message…')
                    : t('board.placeholder', 'Say something…')
                }
                className="flex-1 resize-none max-h-32 px-3.5 py-2 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={send}
                disabled={!draft.trim() || posting}
                className="shrink-0 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-2xl transition-colors text-sm"
              >
                {posting ? '…' : t('board.send', 'Send')}
              </button>
            </div>
          </>
        )}
      </div>

      {songsOpen && (
        <BoardSongsModal
          sessionId={id}
          songs={songs}
          isAdmin={isAdmin}
          active={active}
          onClose={() => setSongsOpen(false)}
        />
      )}
    </div>
  );
};

export default BoardPage;
