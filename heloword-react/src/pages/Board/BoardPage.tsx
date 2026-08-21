import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Client } from '@stomp/stompjs';
import Header from '../../components/Header';
import NicknameEditor from '../../components/NicknameEditor';
import BoardSongsModal from '../../components/BoardSongsModal';
import BoardGuestNamePrompt from './BoardGuestNamePrompt';
import { useAuth } from '../../contexts/AuthContext';
import { useSocial } from '../../contexts/SocialContext';
import { useBoard } from '../../contexts/BoardContext';
import { useImeText } from '../../hooks/useImeText';
import { useViewportHeight } from '../../hooks/useViewportHeight';
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
/** Announcements kept pinned above the chat; older ones collapse behind a toggle. */
const PINNED_OFFICIALS = 1;
/** One-tap reactions beside the setlist chip — applause, laughter, love, burger. */
const QUICK_REACTIONS = ['👏', '😂', '❤️', '🍔'];

/** Absolute timestamp in Taipei time (GMT+8): "MM/DD HH:mm". Shown on tap. */
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

/**
 * Elapsed time, which is what matters during a set — every message shares the
 * same date and hour, so "3m" carries the information that "08/12 21:47" buries.
 * Falls back to the absolute stamp once a message is a day old.
 */
const formatAgo = (iso: string, t: (k: string, d: string) => string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return t('board.justNow', 'just now');
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return formatTime(iso);
};

/**
 * The /songs broadcast is public, so the server strips the host-private notes
 * from it — applying one straight would blank out the notes an admin is reading.
 * Carry the known notes across; the admin's own actions and the snapshot bring
 * authoritative ones back over HTTP.
 */
const mergeSongNotes = (prev: LiveBoardSong[], incoming: LiveBoardSong[]): LiveBoardSong[] => {
  const notes = new Map(prev.filter((s) => s.note).map((s) => [s.id, s.note]));
  return incoming.map((s) => (s.note ? s : { ...s, note: notes.get(s.id) ?? null }));
};

const BoardPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const id = Number(sessionId);
  const navigate = useNavigate();
  const location = useLocation();
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
  const draft = useImeText(MAX_LEN);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [songsOpen, setSongsOpen] = useState(false);
  const [officialMode, setOfficialMode] = useState(false);
  const [confirm, setConfirm] = useState<null | { message: string; confirmLabel: string; onConfirm: () => void }>(null);
  const [annOpen, setAnnOpen] = useState(false);
  const [showAbsTime, setShowAbsTime] = useState(false);
  /** Message whose moderation sheet is open (host only). */
  const [modTarget, setModTarget] = useState<LiveBoardMessage | null>(null);
  /** Set when a guest tries to post before choosing a name (deferred naming). */
  const [namePrompt, setNamePrompt] = useState(false);
  /** What that guest was trying to say, replayed once they have a name. */
  const [pending, setPending] = useState<{ content: string; fromDraft: boolean } | null>(null);
  /** Messages that landed while the reader was scrolled up. Drives the jump button. */
  const [unread, setUnread] = useState(0);

  // Back target. A visitor who landed here from /live or by pasting the URL has
  // nothing of ours behind them in the stack, so popping history would throw
  // them out of the app entirely — send those to home instead. `fromLink` is
  // stamped by LiveBoardRedirect; the idx check catches a pasted /board/:id.
  const cameFromLink = (location.state as { fromLink?: boolean } | null)?.fromLink === true;
  const isFirstEntry = ((window.history.state?.idx as number | undefined) ?? 0) === 0;
  const handleBack = useCallback(() => {
    if (cameFromLink || isFirstEntry) navigate('/home', { replace: true });
    else navigate(-1);
  }, [cameFromLink, isFirstEntry, navigate]);

  // Keeps the composer above the on-screen keyboard on iOS.
  useViewportHeight();

  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;
  /** Synchronous in-flight latch — see postNow. */
  const postingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  /** Comment count already accounted for — the baseline the unread delta is measured from. */
  const seenCountRef = useRef(0);

  const active = session?.boardState === 'ACTIVE';
  // After a session ends the audience can only read, but the admin can still
  // leave announcements. Regular posts are rejected by the backend once the
  // board is not live, so an admin's message on an ended board goes out as an
  // official announcement.
  const endedAdmin = !active && isAdmin;
  const iAmMuted = mutedIds.has(myUserId);
  const officials = messages.filter((m) => m.official);
  const comments = messages.filter((m) => !m.official);
  const performingSong = songs.find((s) => s.performing) || null;
  // Newest announcement stays pinned; the rest collapse, so a run of
  // announcements can't push the chat off a small screen.
  const officialsNewestFirst = [...officials].reverse();
  const pinnedOfficials = officialsNewestFirst.slice(0, PINNED_OFFICIALS);
  const olderOfficials = officialsNewestFirst.slice(PINNED_OFFICIALS);

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
          try {
            const incoming: LiveBoardSong[] = JSON.parse(frame.body) || [];
            setSongs((prev) => mergeSongNotes(prev, incoming));
          } catch { /* ignore */ }
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

  // ── Scroll ───────────────────────────────────────────────────────────────--

  /** Jump to the newest message and re-arm auto-follow. */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    atBottomRef.current = true;
    setUnread(0);
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Follow the conversation only while the reader is already at the bottom.
  // Yanking the view down mid-scroll would lose whatever they went back to read,
  // so anything that arrives while they are up there becomes an unread count on
  // the jump button instead.
  useEffect(() => {
    const delta = comments.length - seenCountRef.current;
    seenCountRef.current = comments.length;
    if (delta === 0) return;
    if (delta < 0) {
      // A deletion, not an arrival — keep the badge honest, don't offer a jump.
      setUnread((n) => Math.max(0, n + delta));
      return;
    }
    if (atBottomRef.current) scrollToBottom('auto');
    else setUnread((n) => n + delta);
  }, [comments.length, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = atBottom;
    // Scrolling down to the newest message is the same as tapping the button.
    if (atBottom) setUnread(0);
  };

  // ── Actions ──────────────────────────────────────────────────────────────--

  /**
   * Posts content that has already cleared the guest-name gate. `authorName`
   * is passed explicitly because a guest who just named themselves won't have
   * the new name in context yet on this tick — reading it from state here would
   * post their first message under the auto-assigned handle.
   */
  const postNow = async (content: string, fromDraft: boolean, authorName?: string) => {
    // Ref, not the `posting` state: two Enters in the same tick both read the
    // pre-update state value and both get through. This flips synchronously.
    if (postingRef.current) return;
    postingRef.current = true;
    setPosting(true);
    setError('');
    try {
      if (isAdmin && (officialMode || endedAdmin)) {
        const msg = await postOfficialMessage(id, content);
        if (msg) setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        if (fromDraft) draft.reset();
        scrollToBottom();
      } else {
        const res = await postBoardMessage(id, content, myUserId, authorName ?? myDisplayName);
        if (res.ok) {
          if (res.data) setMessages((prev) => (prev.some((m) => m.id === res.data!.id) ? prev : [...prev, res.data!]));
          if (fromDraft) draft.reset();
          // Saying something is an implicit "I'm caught up" — go to your own
          // message even if you were reading back through the thread. Called
          // outright rather than left to the effect above, because the socket
          // may have delivered this same message a beat earlier.
          scrollToBottom();
        } else {
          setError(res.message || t('board.postFailed', 'Could not post your message.'));
        }
      }
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  };

  /** Send the composer's text, or `override` for a one-tap reaction. */
  const send = (override?: string) => {
    const fromDraft = override === undefined;
    const content = (fromDraft ? draft.value : override).trim();
    if (!content || postingRef.current) return;
    // Guests read the board without being asked for anything; the name is only
    // needed at the moment they first speak, where the reason is self-evident.
    if (!isLoggedIn && !localStorage.getItem('hw-guest-name')) {
      setPending({ content, fromDraft });
      setNamePrompt(true);
      return;
    }
    postNow(content, fromDraft);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Never submit on the Enter that confirms an IME candidate — see useImeText.
    if (draft.isImeKey(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      // Swallow the key even mid-send, so a second Enter can't insert a newline
      // into the text still on its way to the server.
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

  // Admin moderation → confirm first (avoid accidental taps during a live gig).
  const askDelete = (messageId: number) => {
    setConfirm({
      message: t('board.confirmDelete', 'Delete this message?'),
      confirmLabel: t('board.delete', 'Delete'),
      onConfirm: () => handleDelete(messageId),
    });
  };

  const askMute = (userId: string, name: string) => {
    // Un-muting is harmless — do it directly; only confirm when muting.
    if (mutedIds.has(userId)) {
      handleMute(userId, name);
      return;
    }
    setConfirm({
      message: t('board.confirmMute', 'Mute {name}? They will no longer be able to post.').replace('{name}', name),
      confirmLabel: t('board.mute', 'Mute'),
      onConfirm: () => handleMute(userId, name),
    });
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
        <Header title={t('board.liveBoard', 'Live Board')} showBack onBack={handleBack} minimal />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title={t('board.liveBoard', 'Live Board')} showBack onBack={handleBack} minimal />
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
    <div className="flex flex-col h-screen [height:var(--vvh,100dvh)] bg-gray-50 dark:bg-gray-900">
      <Header title={session.name} showBack onBack={handleBack} minimal />

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2 min-w-0">
          {active ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {t('board.live', 'Live')}
            </span>
          ) : (
            <span className="text-xs font-semibold text-gray-400">{t('board.ended', 'Ended / Not started')}</span>
          )}
          {/* Audience size is for the host to gauge the crowd — showing a low
              count to the audience itself only makes a quiet board look dead. */}
          {active && isAdmin && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              · {t('board.viewers', '{n} watching').replace('{n}', String(presence))}
            </span>
          )}
        </div>
      </div>

      {/* Pinned official messages */}
      {officials.length > 0 && (
        <div className="px-4 pt-3 space-y-2 max-w-2xl mx-auto w-full">
          {(annOpen ? officialsNewestFirst : pinnedOfficials).map((m) => (
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
                <span className="ml-auto shrink-0 text-[10px] text-amber-200/60">
                  {showAbsTime ? formatTime(m.createDate) : formatAgo(m.createDate, t)}
                </span>
                {isAdmin && (
                  <button
                    onClick={() => askDelete(m.id)}
                    className="shrink-0 -mr-1 px-2 py-2 text-amber-200/70 hover:text-amber-100 font-medium text-xs"
                  >
                    {t('board.delete', 'Delete')}
                  </button>
                )}
              </div>
              <p className="text-[15px] font-medium leading-relaxed text-amber-50 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.content}</p>
            </div>
          ))}

          {olderOfficials.length > 0 && (
            <button
              onClick={() => setAnnOpen((v) => !v)}
              aria-expanded={annOpen}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-amber-400/40 bg-amber-400/10 text-[11px] font-semibold text-amber-300 hover:bg-amber-400/15 transition-colors"
            >
              {annOpen
                ? t('board.hideAnnouncements', 'Collapse announcements')
                : t('board.moreAnnouncements', '{n} more announcements').replace('{n}', String(olderOfficials.length))}
              <svg
                className={`w-3 h-3 transition-transform ${annOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Message list */}
      <div className="relative flex-1 min-h-0 flex max-w-2xl mx-auto w-full">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
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
                <div className="max-w-[84%]">
                  {/* Name, elapsed time and like share one line above the bubble. */}
                  <div className={`flex items-center gap-1.5 mb-1 ${mine ? 'justify-end' : ''}`}>
                    {isHost && !mine && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full shrink-0">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2.5 6.5l3 2.5 4.5-5.5 4.5 5.5 3-2.5-1.2 8.5H3.7L2.5 6.5z" />
                        </svg>
                        {t('board.host', 'Host')}
                      </span>
                    )}
                    <span className={`text-[11px] font-semibold truncate max-w-[140px] ${isHost && !mine ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {mine ? t('board.you', 'You') : m.authorName}
                    </span>
                    {/* Host moderation: an explicit, always-visible control. A
                        hover-revealed one is invisible yet still tappable on a
                        touch screen, which makes destructive actions a mis-tap. */}
                    {isAdmin && !mine && (
                      <button
                        onClick={() => setModTarget(m)}
                        className="shrink-0 -my-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        aria-label={t('board.messageActions', 'Message actions')}
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <circle cx="10" cy="4" r="1.7" />
                          <circle cx="10" cy="10" r="1.7" />
                          <circle cx="10" cy="16" r="1.7" />
                        </svg>
                      </button>
                    )}

                    {/* Elapsed time stays on the name line — it's identity/metadata,
                        not an action. */}
                    <button
                      onClick={() => setShowAbsTime((v) => !v)}
                      className="shrink-0 -my-2 px-1 py-2 text-[10px] leading-none text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap"
                      aria-label={t('board.toggleTime', 'Show exact time')}
                    >
                      {showAbsTime ? formatTime(m.createDate) : formatAgo(m.createDate, t)}
                    </button>
                  </div>

                  <div className={`flex items-center gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
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

                    {/* Centred against the bubble it belongs to. `-my-3` keeps the
                        44px tap target from making this row taller than the
                        bubble — that overhang is what opened a gap under the name
                        when the like sat here before. */}
                    <button
                      onClick={() => toggleLike(m)}
                      aria-pressed={likedIds.has(m.id)}
                      className={`shrink-0 -my-3 min-w-[44px] min-h-[44px] inline-flex items-center justify-center gap-0.5 rounded-xl transition-colors active:scale-90 ${
                        likedIds.has(m.id) ? 'text-pink-500' : 'text-gray-400 hover:text-pink-500'
                      }`}
                      aria-label={t('board.like', 'Like')}
                    >
                      <svg className="w-4 h-4" fill={likedIds.has(m.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      {m.likeCount > 0 && <span className="text-[10px] font-bold leading-none tabular-nums">{m.likeCount}</span>}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Jump to newest. Only appears once something has actually arrived that
            the reader hasn't seen — a permanently parked button is furniture, and
            the count is the part that tells them whether it's worth the tap. */}
        {unread > 0 && (
          <button
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 pl-2.5 pr-3.5 py-2 rounded-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-xs font-semibold shadow-lg shadow-blue-500/30 active:scale-95 transition-all animate-fade-in"
            aria-label={t('board.jumpToNewest', 'Jump to newest message')}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            <span className="tabular-nums">
              {t('board.newMessages', '{n} new').replace('{n}', String(unread))}
            </span>
          </button>
        )}
      </div>

      {/* Now-performing banner. It sits against the composer rather than at the
          top because that is where the eye already is — you read the song you
          are hearing in the same glance as the box you are about to type in,
          and it can't be pushed off-screen by a run of announcements. */}
      {performingSong && (
        <div className="px-4 pb-2 max-w-2xl mx-auto w-full">
          <div className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3 py-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
            <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M18 3a1 1 0 00-1.196-.98l-8 1.6A1 1 0 008 4.6v7.07A3.5 3.5 0 109 14.5V8.82l7-1.4v3.25a3.5 3.5 0 101 2.45V3z" />
            </svg>
            <span className="text-[11px] font-bold tracking-wide shrink-0">{t('board.nowSinging', '現在唱的是 →')}</span>
            <span className="text-xs font-semibold truncate min-w-0">{performingSong.title}</span>
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(performingSong.title)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full transition-colors"
            >
              {t('board.googleIt', 'Google it')}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      )}

      {/* Composer / ended notice */}
      <div className="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] max-w-2xl mx-auto w-full">
        {!active && !isAdmin ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-2">
            {t('board.endedNotice', 'This session has ended or hasn’t started yet. You can read the messages but can no longer post.')}
          </p>
        ) : iAmMuted ? (
          <p className="text-center text-sm text-amber-500 py-2">
            {t('board.mutedNotice', 'You have been muted by the host.')}
          </p>
        ) : (
          <>
            {endedAdmin && (
              <p className="text-[11px] text-amber-500 mb-2">
                {t('board.endedAdminNotice', 'This session has ended or hasn’t started yet — your message will be posted as an official announcement.')}
              </p>
            )}
            {/* Setlist promoted out of the modal — requesting a song is the
                thing an audience actually came to do. */}
            <div className="flex items-center gap-2 mb-2 overflow-x-auto">
              <button
                onClick={() => setSongsOpen(true)}
                className="shrink-0 inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-full text-xs font-semibold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/40 hover:bg-blue-100 dark:hover:bg-blue-500/25 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M18 3a1 1 0 00-1.196-.98l-8 1.6A1 1 0 008 4.6v7.07A3.5 3.5 0 109 14.5V8.82l7-1.4v3.25a3.5 3.5 0 101 2.45V3z" />
                </svg>
                {t('board.setlist', 'Setlist')}
                {songs.length > 0 && <span className="tabular-nums">· {songs.length}</span>}
              </button>

              {/* One-tap reactions. They post as ordinary messages, so everyone
                  sees them and the mute/ended rules apply unchanged — no typing
                  needed to join in mid-song. */}
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => send(emoji)}
                  disabled={posting}
                  className="shrink-0 min-w-[44px] min-h-[38px] inline-flex items-center justify-center text-lg leading-none rounded-full border border-gray-200 dark:border-gray-600 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-90 disabled:opacity-40 transition-all"
                  aria-label={t('board.sendReaction', 'Send {e}').replace('{e}', emoji)}
                >
                  {emoji}
                </button>
              ))}
              {isAdmin && !endedAdmin && (
                <button
                  onClick={() => setOfficialMode((v) => !v)}
                  aria-pressed={officialMode}
                  className={`shrink-0 min-h-[38px] text-xs font-semibold px-3.5 py-2 rounded-full border transition-colors ${
                    officialMode
                      ? 'bg-amber-500 border-amber-500 text-amber-950'
                      : 'bg-transparent border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300'
                  }`}
                >
                  {t('board.officialMode', 'Official')}
                </button>
              )}
            </div>
            {error && <p className="text-xs text-red-500 mb-1.5">{error}</p>}
            <div className="flex items-end gap-2">
              {/* readOnly rather than disabled while sending: `disabled` blurs
                  the field, which drops the iOS keyboard and reopens it a beat
                  later. readOnly locks the text just as firmly and keeps focus. */}
              <textarea
                {...draft.bind}
                onKeyDown={onKeyDown}
                rows={1}
                readOnly={posting}
                enterKeyHint="send"
                autoCapitalize="sentences"
                autoCorrect="off"
                placeholder={
                  isAdmin && (officialMode || endedAdmin)
                    ? t('board.officialPlaceholder', 'Post an official message…')
                    : t('board.placeholder', 'Say something…')
                }
                className={`flex-1 resize-none max-h-32 px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-base transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  posting ? 'opacity-50' : ''
                }`}
              />
              <button
                onClick={() => send()}
                disabled={!draft.value.trim() || posting}
                className="shrink-0 min-w-[44px] min-h-[44px] bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 text-white font-semibold px-4 rounded-2xl transition-colors text-sm"
              >
                {posting ? '…' : t('board.send', 'Send')}
              </button>
            </div>
            <div className="mt-2">
              <NicknameEditor />
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
          onSongsChange={setSongs}
          onClose={() => setSongsOpen(false)}
        />
      )}

      {confirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setConfirm(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs p-6 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-gray-700 dark:text-gray-200 mb-5">{confirm.message}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={() => { confirm.onConfirm(); setConfirm(null); }}
                className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-semibold text-sm transition-colors"
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host moderation sheet — replaces the hover-revealed inline buttons */}
      {modTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50"
          onClick={() => setModTarget(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto my-2" />
            <p className="px-3 pt-1 pb-2 text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
              {modTarget.authorName}
            </p>

            <button
              onClick={() => { askMute(modTarget.authorUserId, modTarget.authorName); setModTarget(null); }}
              className="flex items-center gap-3 w-full px-3 py-3.5 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <svg className="w-[17px] h-[17px] text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                {!mutedIds.has(modTarget.authorUserId) && (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l4-4m0 4l-4-4" />
                )}
              </svg>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {mutedIds.has(modTarget.authorUserId) ? t('board.unmute', 'Unmute') : t('board.mute', 'Mute')}
              </span>
            </button>

            <button
              onClick={() => { askDelete(modTarget.id); setModTarget(null); }}
              className="flex items-center gap-3 w-full px-3 py-3.5 rounded-xl text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <svg className="w-[17px] h-[17px] text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="text-sm font-medium text-red-500">{t('board.delete', 'Delete')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Deferred guest naming — asked at the first post, not on arrival */}
      {namePrompt && (
        <BoardGuestNamePrompt
          onDone={(name) => {
            setNamePrompt(false);
            const p = pending;
            setPending(null);
            if (p) postNow(p.content, p.fromDraft, name);
          }}
          onCancel={() => { setNamePrompt(false); setPending(null); }}
        />
      )}
    </div>
  );
};

export default BoardPage;
