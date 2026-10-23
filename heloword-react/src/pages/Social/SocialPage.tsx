import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useSocial } from '../../contexts/SocialContext';
import { computeRoomId, Friend, OfficialMessage, OnlineUser } from '../../services/social.service';

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * If `name` looks like an email address, mask the local part so the user's
 * email is never displayed in plain text.
 *
 * Examples:
 *   "alice@example.com"  → "ali***"
 *   "ab@example.com"     → "ab***"
 *   "Alice"              → "Alice"   (unchanged — not an email)
 */
function maskIfEmail(name: string): string {
  const atIdx = name.indexOf('@');
  if (atIdx === -1) return name;
  const local = name.slice(0, atIdx);
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***`;
}

// ── Sub-components ────────────────────────────────────────────────────────

const Avatar: React.FC<{ name: string; online?: boolean; size?: 'sm' | 'md' }> = ({
  name,
  online,
  size = 'md',
}) => {
  const safe = maskIfEmail(name);
  const initials = safe.slice(0, 2).toUpperCase();
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className={`relative flex-shrink-0 ${sz} rounded-full bg-accent-soft flex items-center justify-center font-semibold text-accent`}>
      {initials}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-line ${
            online ? 'bg-success' : 'bg-ink/20 '
          }`}
        />
      )}
    </div>
  );
};

// ── Chat Panel ────────────────────────────────────────────────────────────

const ChatPanel: React.FC<{
  targetUserId: string;
  targetDisplayName: string;
  onClose: () => void;
}> = ({ targetUserId, targetDisplayName, onClose }) => {
  const { t } = useTranslation();
  const { myUserId, myDisplayName, messageMap, sendMessage } = useSocial();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const roomId = computeRoomId(myUserId, targetUserId);
  const messages = messageMap[roomId] ?? [];

  React.useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput('');
    await sendMessage(text);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    // Skip while IME composition is active (Chinese/Japanese/Korean input on Mac/Windows).
    // Without this guard, pressing Enter to confirm an IME candidate also fires this
    // handler and sends a duplicate message before the user intends to send.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/5 sm:items-center sm:justify-center">
      <div className="flex flex-col w-full max-w-2xl h-full sm:h-[85vh] sm:rounded-2xl sm:shadow-2xl bg-surface overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line bg-surface backdrop-blur-sm flex-shrink-0">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-xl hover:bg-ink/5 transition-colors"
          >
            <svg className="w-5 h-5 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <Avatar name={targetDisplayName} size="sm" />
          <span className="font-semibold text-ink flex-1 truncate">
            {targetDisplayName}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {messages.length === 0 && (
            <p className="text-center text-xs text-ink-faint mt-8">
              {t('social.noMessages')}
            </p>
          )}
          {messages.map((msg) => {
            const isMine = msg.senderUserId === myUserId;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    isMine
                      ? 'bg-ink text-paper rounded-br-sm'
                      : 'bg-ink/5 dark:ring-1 text-ink rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                  <div className={`text-[9px] mt-0.5 opacity-60 ${isMine ? 'text-white' : 'text-ink-muted '}`}>
                    {new Date(msg.sentAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex items-end gap-2 px-4 pb-6 pt-2 border-t border-line bg-surface flex-shrink-0">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('social.messagePlaceholder')}
            className="flex-1 resize-none rounded-2xl border border-line bg-paper text-sm text-ink px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 bg-ink hover:bg-ink/85 disabled:opacity-40 text-paper rounded-2xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── Official Messages Panel ───────────────────────────────────────────────

const OfficialPanel: React.FC<{
  messages: OfficialMessage[];
  onClose: () => void;
}> = ({ messages, onClose }) => {
  const { t } = useTranslation();
  const sorted = [...messages].sort((a, b) => b.id - a.id);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/5 sm:items-center sm:justify-center">
      <div className="flex flex-col w-full max-w-2xl h-full sm:h-[85vh] sm:rounded-2xl sm:shadow-2xl bg-surface overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line bg-surface backdrop-blur-sm flex-shrink-0">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-xl hover:bg-ink/5 transition-colors"
          >
            <svg className="w-5 h-5 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-semibold text-ink flex-1">{t('social.officialChannelTitle')}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {sorted.length === 0 && (
            <p className="text-center text-xs text-ink-faint mt-8">{t('social.officialChannelEmpty')}</p>
          )}
          {sorted.map((msg) => (
            <div key={msg.id} className="bg-ink/5 rounded-2xl px-4 py-3">
              <p className="text-sm font-semibold text-ink">{msg.title}</p>
              <p className="text-xs text-ink-faint mt-0.5 mb-1">
                {new Date(msg.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
              <p className="text-sm text-ink whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── Nickname edit modal ───────────────────────────────────────────────────

const NicknameModal: React.FC<{
  friend: Friend;
  onClose: () => void;
}> = ({ friend, onClose }) => {
  const { t } = useTranslation();
  const { doUpdateFriendNickname } = useSocial();
  const [value, setValue] = useState(friend.myNickname ?? '');

  const handleSave = async () => {
    await doUpdateFriendNickname(friend.id, value.trim());
    onClose();
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-ink mb-1">{t('social.setNickname')}</h3>
        <p className="text-xs text-ink-muted mb-3">{t('social.nicknameHint', { name: maskIfEmail(friend.displayName) })}</p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="w-full rounded-xl border border-line bg-paper text-sm px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder={t('social.nicknamePlaceholder')}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-ink-muted hover:text-ink transition-colors">
            {t('social.cancel')}
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-ink hover:bg-ink/85 text-paper rounded-xl transition-colors">
            {t('social.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── Main Social Page ──────────────────────────────────────────────────────

const SocialPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const {
    myUserId,
    myDisplayName,
    onlineUsers,
    friends,
    unreadCounts,
    messageMap,
    chatRooms,
    loadChatRooms,
    activeChatUserId,
    openChat,
    closeChat,
    doSendFriendRequest,
    doAcceptFriendRequest,
    doRejectFriendRequest,
    doRemoveFriend,
    refreshFriends,
    mutedUserIds,
    muteUser,
    unmuteUser,
    vocabShares,
    doAcceptVocabShare,
    doRejectVocabShare,
    hideOnlineStatus,
    setHideOnlineStatus,
    officialMessages,
    officialUnread,
    markOfficialSeen,
  } = useSocial();

  const [activeTab, setActiveTab] = useState<'online' | 'friends' | 'messages'>('online');
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [officialPanelOpen, setOfficialPanelOpen] = useState(false);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [friendActionError, setFriendActionError] = useState<string | null>(null);
  const [vocabShareActingId, setVocabShareActingId] = useState<number | null>(null);
  const [addingFriendId, setAddingFriendId] = useState<string | null>(null);
  const [onlineTabError, setOnlineTabError] = useState<string | null>(null);

  React.useEffect(() => {
    if (activeTab === 'messages') {
      setRoomsLoading(true);
      loadChatRooms().finally(() => setRoomsLoading(false));
    } else if (isLoggedIn) {
      // Refresh friends on both Online and Friends tabs so friendship status
      // buttons in the Online tab stay accurate.
      refreshFriends();
    }
  }, [activeTab, isLoggedIn, refreshFriends]);

  // Poll friends list every 10 s on the Online and Friends tabs so incoming
  // requests appear even when the WebSocket push is missed.
  React.useEffect(() => {
    if (!isLoggedIn || activeTab === 'messages') return;
    const id = setInterval(() => { refreshFriends(); }, 10_000);
    return () => clearInterval(id);
  }, [activeTab, isLoggedIn, refreshFriends]);
  const [nicknameTarget, setNicknameTarget] = useState<Friend | null>(null);
  const [friendRequestInput, setFriendRequestInput] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);
  const [friendRequestError, setFriendRequestError] = useState<string | null>(null);
  const [friendRequestSuccess, setFriendRequestSuccess] = useState(false);

  // Resolve target display name for chat
  const chatTargetUser: OnlineUser | Friend | undefined =
    onlineUsers.find((u) => u.userId === activeChatUserId)
    ?? friends.find((f) => f.otherUserId === activeChatUserId);
  const chatDisplayName = maskIfEmail(
    (chatTargetUser as any)?.myNickname
    || chatTargetUser?.displayName
    || activeChatUserId
    || '',
  );

  if (activeChatUserId) {
    return (
      <ChatPanel
        targetUserId={activeChatUserId}
        targetDisplayName={chatDisplayName}
        onClose={closeChat}
      />
    );
  }

  if (officialPanelOpen) {
    return <OfficialPanel messages={officialMessages} onClose={() => setOfficialPanelOpen(false)} />;
  }

  const otherOnlineUsers = onlineUsers.filter((u) => u.userId !== myUserId);
  const acceptedFriends = friends.filter((f) => f.status === 'ACCEPTED');
  const pendingReceived = friends.filter((f) => f.status === 'PENDING_RECEIVED');
  const pendingSent = friends.filter((f) => f.status === 'PENDING_SENT');
  // Map userId → friendship for O(1) status lookup in the Online tab
  const friendshipByUserId = new Map(friends.map((f) => [f.otherUserId, f]));
  // Display name from the online-users heartbeat (their public name — nickname or a neutral label, never their Google name)
  const onlineDisplayByUserId = new Map(onlineUsers.map((u) => [u.userId, u.displayName]));
  const totalUnread = Object.values(unreadCounts).reduce((s, n) => s + n, 0);

  // Resolve a display name: friends (with nickname) → online users → message senderDisplayName → userId
  // maskIfEmail is applied at every return point so no email ever reaches the UI.
  const resolveDisplayName = (userId: string, hint?: import('../../services/social.service').ChatMessage): string => {
    const friend = acceptedFriends.find((f) => f.otherUserId === userId);
    if (friend) return friend.myNickname || maskIfEmail(friend.displayName);
    const online = onlineUsers.find((u) => u.userId === userId);
    if (online) return maskIfEmail(online.displayName);
    // Use display name stored in the message if the other person was the sender
    if (hint && hint.senderUserId === userId) return maskIfEmail(hint.senderDisplayName);
    // Scan already-loaded messages for that room to find one sent by them
    const roomMsgs = messageMap[hint?.roomId ?? ''] ?? [];
    const theirMsg = roomMsgs.find((m) => m.senderUserId === userId);
    if (theirMsg) return maskIfEmail(theirMsg.senderDisplayName);
    return maskIfEmail(userId);
  };

  const handleSendFriendRequest = async () => {
    const target = friendRequestInput.trim();
    if (!target) return;
    setSendingRequest(true);
    setFriendRequestError(null);
    setFriendRequestSuccess(false);
    try {
      await doSendFriendRequest(target);
      setFriendRequestInput('');
      setFriendRequestSuccess(true);
      setTimeout(() => setFriendRequestSuccess(false), 3000);
    } catch (e: any) {
      setFriendRequestError(e?.message || t('social.requestFailed'));
    } finally {
      setSendingRequest(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
      <Header title={t('nav.social')} hideLogin />

      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full">

        {/* My identity badge */}
        <div className="flex items-center gap-3 bg-surface rounded-2xl p-3 mb-4 border border-line shadow-sm">
          <Avatar name={myDisplayName} online={!hideOnlineStatus} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink truncate">{myDisplayName}</p>
            <p className="text-xs text-ink-faint truncate">
              {isLoggedIn ? t('social.loggedIn') : t('social.guestMode')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-ink-faint">{t('social.appearOnline')}</span>
            <button
              role="switch"
              aria-checked={!hideOnlineStatus}
              onClick={() => setHideOnlineStatus(!hideOnlineStatus)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                !hideOnlineStatus ? 'bg-success' : 'bg-ink/20 '
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-surface rounded-full shadow transition-transform ${
                !hideOnlineStatus ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>
          {!isLoggedIn && (
            <button
              onClick={() => navigate('/login')}
              className="text-xs bg-ink hover:bg-ink/85 text-paper px-3 py-1.5 rounded-xl transition-colors"
            >
              {t('common.login')}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex bg-surface rounded-2xl border border-line p-1 mb-4 gap-1">
          {(['online', 'friends', 'messages'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-ink text-paper shadow-sm'
                  : 'text-ink-muted hover:text-ink '
              }`}
            >
              {tab === 'online' ? (
                <>
                  {t('social.tabOnline')}
                  {otherOnlineUsers.length > 0 && (
                    <span className="ml-1.5 text-xs bg-paper/20 rounded-full px-1.5">{otherOnlineUsers.length}</span>
                  )}
                </>
              ) : tab === 'friends' ? (
                <>
                  {t('social.tabFriends')}
                  {pendingReceived.length > 0 && (
                    <span className="ml-1.5 text-xs bg-ink text-paper rounded-full px-1.5">{pendingReceived.length}</span>
                  )}
                </>
              ) : (
                <>
                  {t('social.tabMessages')}
                  {(totalUnread + officialUnread) > 0 && (
                    <span className="ml-1.5 text-xs bg-accent text-paper rounded-full px-1.5">{(totalUnread + officialUnread) > 99 ? '99+' : (totalUnread + officialUnread)}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {/* ── Online tab ── */}
        {activeTab === 'online' && (
          <div className="space-y-2">
            {onlineTabError && (
              <p className="text-xs text-danger px-1">{onlineTabError}</p>
            )}
            {otherOnlineUsers.length === 0 ? (
              <div className="text-center py-12 text-ink-faint text-sm">
                {t('social.noOneOnline')}
              </div>
            ) : (
              otherOnlineUsers.map((u) => (
                <div
                  key={u.userId}
                  className="flex items-center gap-3 bg-surface rounded-2xl p-3 border border-line shadow-sm"
                >
                  <Avatar name={maskIfEmail(u.displayName)} online={true} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{maskIfEmail(u.displayName)}</p>
                    <p className="text-xs text-ink-faint">
                      {u.isGuest ? t('social.guestUser') : t('social.member')}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={isLoggedIn && !u.isGuest ? () => openChat(u.userId, u.displayName) : undefined}
                      disabled={!isLoggedIn || u.isGuest}
                      title={!isLoggedIn ? t('social.loginToChat') : u.isGuest ? t('social.cannotMessageGuest') : t('social.chat')}
                      className={`relative p-2 rounded-xl transition-colors ${isLoggedIn && !u.isGuest ? 'bg-accent-soft hover:bg-accent-soft text-accent cursor-pointer' : 'bg-ink/5 text-ink-faint cursor-not-allowed opacity-50'}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {isLoggedIn && !u.isGuest && (unreadCounts[u.userId] ?? 0) > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-accent text-paper text-[10px] font-semibold rounded-full flex items-center justify-center px-0.5 leading-none">
                          {unreadCounts[u.userId] > 99 ? '99+' : unreadCounts[u.userId]}
                        </span>
                      )}
                    </button>
                    {isLoggedIn && !u.isGuest && (() => {
                      const fs = friendshipByUserId.get(u.userId);
                      if (!fs) {
                        // No relationship — show Add Friend button
                        return (
                          <button
                            disabled={addingFriendId === u.userId}
                            onClick={async () => {
                              setAddingFriendId(u.userId);
                              setOnlineTabError(null);
                              try {
                                await doSendFriendRequest(u.userId);
                                setActiveTab('friends');
                              } catch (e: any) {
                                setOnlineTabError(e?.message || t('social.requestFailed'));
                              } finally {
                                setAddingFriendId(null);
                              }
                            }}
                            className="p-2 bg-success-soft hover:bg-success-soft disabled:opacity-50 text-success rounded-xl transition-colors"
                            title={t('social.addFriend')}
                          >
                            {addingFriendId === u.userId ? (
                              <span className="w-4 h-4 border-2 border-success border-t-transparent rounded-full animate-spin inline-block" />
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                              </svg>
                            )}
                          </button>
                        );
                      }
                      if (fs.status === 'ACCEPTED') {
                        // Already friends — no extra button needed (chat button above is enough)
                        return null;
                      }
                      if (fs.status === 'PENDING_SENT') {
                        // We already sent them a request
                        return (
                          <span className="text-xs text-ink-faint px-1">{t('social.pending')}</span>
                        );
                      }
                      if (fs.status === 'PENDING_RECEIVED') {
                        // They sent us a request — show Accept directly here
                        return (
                          <button
                            disabled={acceptingId === fs.id}
                            onClick={async () => {
                              setAcceptingId(fs.id);
                              setFriendActionError(null);
                              try {
                                await doAcceptFriendRequest(fs.id);
                              } catch {
                                setFriendActionError(t('social.acceptFailed'));
                              } finally {
                                setAcceptingId(null);
                              }
                            }}
                            className="text-xs bg-ink hover:bg-ink/85 disabled:opacity-50 text-paper px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {acceptingId === fs.id ? '...' : t('social.accept')}
                          </button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Friends tab ── */}
        {activeTab === 'friends' && (
          <div className="space-y-4">
            {!isLoggedIn ? (
              <div className="bg-accent-soft border border-line rounded-2xl p-4 text-center">
                <p className="text-sm text-accent mb-3">{t('social.loginForFriends')}</p>
                <button
                  onClick={() => navigate('/login')}
                  className="text-sm bg-ink hover:bg-ink/85 text-paper px-4 py-2 rounded-xl transition-colors"
                >
                  {t('common.login')}
                </button>
              </div>
            ) : (
              <>
                {/* Pending received */}
                {pendingReceived.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide px-1 mb-2">
                      {t('social.pendingRequests')} ({pendingReceived.length})
                    </p>
                    {friendActionError && (
                      <p className="text-xs text-danger px-1 mb-2">{friendActionError}</p>
                    )}
                    <div className="space-y-2">
                      {pendingReceived.map((f) => {
                        const primaryName = f.displayName;
                        return (
                        <div key={f.id} className="flex items-center gap-3 bg-accent-soft rounded-2xl p-3 border border-accent/30">
                          <Avatar name={primaryName} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink truncate">{primaryName}</p>
                          </div>
                          <button
                            disabled={acceptingId === f.id}
                            onClick={async () => {
                              setAcceptingId(f.id);
                              setFriendActionError(null);
                              try {
                                await doAcceptFriendRequest(f.id);
                              } catch {
                                setFriendActionError(t('social.acceptFailed'));
                              } finally {
                                setAcceptingId(null);
                              }
                            }}
                            className="text-xs bg-ink hover:bg-ink/85 disabled:opacity-50 text-paper px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {acceptingId === f.id ? '...' : t('social.accept')}
                          </button>
                          <button
                            disabled={acceptingId === f.id}
                            onClick={() => doRejectFriendRequest(f.id).catch(() => {})}
                            className="text-xs text-ink-faint hover:text-danger disabled:opacity-50 transition-colors ml-1"
                          >
                            {t('social.reject')}
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Vocab share requests */}
                {vocabShares.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide px-1 mb-2">
                      {t('vocabShare.inboxTitle', 'Shared Vocab Groups')} ({vocabShares.length})
                    </p>
                    <div className="space-y-2">
                      {vocabShares.map((share) => {
                        const senderFriend = friends.find((f) => f.otherUserId === share.fromUsername);
                        const senderName = senderFriend?.displayName
                          ? maskIfEmail(senderFriend.displayName)
                          : maskIfEmail(share.groupName);
                        return (
                        <div key={share.id} className="flex items-start gap-3 bg-accent-soft rounded-2xl p-3 border border-line">
                          <div className="w-9 h-9 rounded-full bg-accent-soft flex items-center justify-center shrink-0 mt-0.5">
                            <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ink truncate">{share.groupName}</p>
                            <p className="text-xs text-ink-muted mt-0.5">
                              {t('vocabShare.from', 'From')} <span className="font-medium">{senderName}</span>
                              {' · '}{share.wordCount} {t('vocabShare.words', 'words')}
                              {share.language && <span className="ml-1 text-accent">[{share.language}]</span>}
                            </p>
                            {share.description && (
                              <p className="text-xs text-ink-faint mt-0.5 truncate">{share.description}</p>
                            )}
                          </div>
                          <div className="flex flex-row gap-2 items-center shrink-0">
                            <button
                              disabled={vocabShareActingId === share.id}
                              onClick={async () => {
                                setVocabShareActingId(share.id);
                                try {
                                  await doAcceptVocabShare(share.id);
                                } finally {
                                  setVocabShareActingId(null);
                                }
                              }}
                              className="text-xs bg-ink hover:bg-ink/85 disabled:opacity-50 text-paper px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                            >
                              {vocabShareActingId === share.id ? '...' : t('vocabShare.accept', 'Accept')}
                            </button>
                            <button
                              disabled={vocabShareActingId === share.id}
                              onClick={async () => {
                                setVocabShareActingId(share.id);
                                try {
                                  await doRejectVocabShare(share.id);
                                } finally {
                                  setVocabShareActingId(null);
                                }
                              }}
                              className="text-xs text-ink-faint hover:text-danger disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              {t('vocabShare.reject', 'Decline')}
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Accepted friends */}
                {acceptedFriends.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide px-1 mb-2">
                      {t('social.friends')} ({acceptedFriends.length})
                    </p>
                    <div className="space-y-2">
                      {acceptedFriends.map((f) => {
                        // maskIfEmail handles the case where myNickname was auto-populated with their username (an email)
                        const primaryName = f.displayName;
                        return (
                        <div key={f.id} className="flex items-center gap-3 bg-surface rounded-2xl p-3 border border-line shadow-sm">
                          <Avatar name={primaryName} online={f.isOnline} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink truncate">{primaryName}</p>
                            {/* {primaryName !== maskedEmail && <p className="text-xs text-ink-faint truncate">{maskedEmail}</p>} */}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => openChat(f.otherUserId, f.myNickname || f.displayName)}
                              className="relative p-2 text-accent hover:bg-accent-soft rounded-xl transition-colors"
                              title={t('social.chat')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              {(unreadCounts[f.otherUserId] ?? 0) > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-accent text-paper text-[10px] font-semibold rounded-full flex items-center justify-center px-0.5 leading-none">
                                  {unreadCounts[f.otherUserId] > 99 ? '99+' : unreadCounts[f.otherUserId]}
                                </span>
                              )}
                            </button>
                            {/* Friends tab is only shown to logged-in members; button always active here */}
                            <button
                              onClick={() => setNicknameTarget(f)}
                              className="p-2 text-ink-faint hover:text-accent hover:bg-paper rounded-xl transition-colors"
                              title={t('social.setNickname')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => mutedUserIds.has(f.otherUserId) ? unmuteUser(f.otherUserId) : muteUser(f.otherUserId)}
                              className={`p-2 rounded-xl transition-colors ${mutedUserIds.has(f.otherUserId) ? 'text-accent hover:text-accent hover:bg-accent-soft ' : 'text-ink-faint hover:text-ink-muted hover:bg-paper '}`}
                              title={mutedUserIds.has(f.otherUserId) ? t('social.unmute') : t('social.mute')}
                            >
                              {mutedUserIds.has(f.otherUserId) ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() => doRemoveFriend(f.id).catch(() => {})}
                              className="p-2 text-ink-faint hover:text-danger hover:bg-danger-soft rounded-xl transition-colors"
                              title={t('social.removeFriend')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pending sent */}
                {pendingSent.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide px-1 mb-2">
                      {t('social.pendingSent')} ({pendingSent.length})
                    </p>
                    <div className="space-y-2">
                      {pendingSent.map((f) => {
                        const primaryName = f.displayName
                        return (
                        <div key={f.id} className="flex items-center gap-3 bg-paper rounded-2xl p-3 border border-line opacity-80">
                          <Avatar name={primaryName} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-ink-muted truncate">{primaryName}</p>
                          </div>
                          <span className="text-xs text-ink-faint">{t('social.pending')}</span>
                          <button onClick={() => doRemoveFriend(f.id).catch(() => {})} className="text-xs text-ink-faint hover:text-danger ml-2 transition-colors">
                            {t('social.cancel')}
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {acceptedFriends.length === 0 && pendingReceived.length === 0 && pendingSent.length === 0 && (
                  <div className="text-center py-10 text-ink-faint text-sm">
                    {t('social.noFriends')}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Messages tab ── */}
        {activeTab === 'messages' && (
          <div className="space-y-2">
            {/* Pinned official channel — always visible */}
            <button
              onClick={() => { markOfficialSeen(); setOfficialPanelOpen(true); }}
              className="w-full flex items-center gap-3 p-3 bg-accent-soft rounded-2xl border border-line shadow-sm hover:bg-accent-soft transition-colors text-left"
            >
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-ink flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                </div>
                {officialUnread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-accent text-paper text-[10px] font-semibold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {officialUnread > 99 ? '99+' : officialUnread}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-accent truncate">{t('social.officialChannel')}</p>
                  {officialMessages.length > 0 && (
                    <span className="text-[11px] text-ink-faint flex-shrink-0">
                      {new Date(officialMessages[0].publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-faint truncate mt-0.5">
                  {officialMessages[0]?.content ?? t('social.officialChannelEmpty')}
                </p>
              </div>
            </button>

            {roomsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : chatRooms.length === 0 ? (
              <div className="text-center py-8 text-ink-faint text-sm">
                {t('social.noConversations')}
              </div>
            ) : (
              chatRooms.map((msg) => {
                const otherUserId = msg.senderUserId === myUserId ? msg.recipientUserId : msg.senderUserId;
                const displayName = resolveDisplayName(otherUserId, msg);
                const unread = unreadCounts[otherUserId] ?? 0;
                const isMine = msg.senderUserId === myUserId;
                const preview = isMine ? `${t('social.you')}: ${msg.content}` : msg.content;
                const time = new Date(msg.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                const isMuted = mutedUserIds.has(otherUserId);
                return (
                  <div
                    key={msg.roomId}
                    className="w-full flex items-center bg-surface rounded-2xl border border-line shadow-sm overflow-hidden"
                  >
                    <button
                      onClick={() => openChat(otherUserId, displayName)}
                      className="flex-1 flex items-center gap-3 p-3 hover:bg-paper transition-colors text-left min-w-0"
                    >
                      <div className="relative flex-shrink-0">
                        <Avatar name={displayName} online={onlineUsers.some((u) => u.userId === otherUserId)} />
                        {unread > 0 && (
                          <div className="absolute -top-1 -right-1">
                            <span className="absolute inset-0 rounded-full bg-danger animate-ping opacity-75" />
                            <span className="relative min-w-[16px] h-4 bg-accent text-paper text-[10px] font-semibold rounded-full flex items-center justify-center px-0.5 leading-none">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={`text-sm font-semibold truncate ${unread > 0 ? 'text-ink ' : 'text-ink '}`}>
                            {displayName}
                            {isMuted && <span className="ml-1.5 text-[10px] font-normal text-accent">{t('social.muted')}</span>}
                          </p>
                          <span className="text-[11px] text-ink-faint flex-shrink-0">{time}</span>
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-ink font-medium' : 'text-ink-faint '}`}>
                          {preview}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => isMuted ? unmuteUser(otherUserId) : muteUser(otherUserId)}
                      className={`flex-shrink-0 p-3 transition-colors ${isMuted ? 'text-accent hover:text-accent' : 'text-ink-faint hover:text-ink-muted'}`}
                      title={isMuted ? t('social.unmute') : t('social.mute')}
                    >
                      {isMuted ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

      </main>

      {nicknameTarget && (
        <NicknameModal friend={nicknameTarget} onClose={() => setNicknameTarget(null)} />
      )}
    </div>
  );
};

export default SocialPage;
